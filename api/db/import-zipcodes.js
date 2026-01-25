#!/usr/bin/env node
/**
 * US Zip Code Data Importer
 * Downloads and imports US zip code data into PostgreSQL
 * 
 * Usage: 
 *   node import-zipcodes.js
 * 
 * Requires DATABASE_URL environment variable
 */

const { Pool } = require('pg');
const https = require('https');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// US Zip code data source (free data from opendatasoft)
const ZIP_DATA_URL = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/us-zip-code-latitude-and-longitude/exports/csv?lang=en&timezone=UTC&use_labels=true&delimiter=%3B';

// Alternative: use local file
const LOCAL_ZIP_FILE = path.join(__dirname, 'us-zipcodes.csv');

/**
 * Download zip code data
 */
async function downloadZipData() {
    return new Promise((resolve, reject) => {
        console.log('📥 Downloading US zip code data...');
        
        const file = fs.createWriteStream(LOCAL_ZIP_FILE);
        
        https.get(ZIP_DATA_URL, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                https.get(response.headers.location, (res) => {
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlink(LOCAL_ZIP_FILE, () => {});
            reject(err);
        });
    });
}

/**
 * Parse CSV and import to database
 */
async function importZipCodes() {
    console.log('📊 Importing zip codes to database...');
    
    const client = await pool.connect();
    
    try {
        // Start transaction
        await client.query('BEGIN');
        
        // Clear existing data
        await client.query('TRUNCATE TABLE zip_codes CASCADE');
        console.log('✓ Cleared existing zip code data');
        
        // Read and parse CSV
        const fileStream = fs.createReadStream(LOCAL_ZIP_FILE);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineCount = 0;
        let insertCount = 0;
        let headers = null;
        const batchSize = 500;
        let batch = [];
        
        for await (const line of rl) {
            lineCount++;
            
            // Parse header
            if (lineCount === 1) {
                headers = line.split(';').map(h => h.trim().toLowerCase().replace(/"/g, ''));
                console.log('Headers:', headers);
                continue;
            }
            
            // Parse data line
            const values = line.split(';').map(v => v.trim().replace(/"/g, ''));
            
            // Map to object
            const row = {};
            headers.forEach((h, i) => {
                row[h] = values[i] || null;
            });
            
            // Extract fields (adjust based on actual CSV structure)
            const zipCode = row['zip'] || row['zipcode'] || row['zip code'];
            const city = row['city'] || row['primary_city'];
            const state = row['state'] || row['state_code'];
            const latitude = parseFloat(row['latitude'] || row['lat']);
            const longitude = parseFloat(row['longitude'] || row['lng'] || row['lon']);
            
            // Skip invalid rows
            if (!zipCode || !city || !state || isNaN(latitude) || isNaN(longitude)) {
                continue;
            }
            
            // Add to batch
            batch.push({ zipCode, city, state, latitude, longitude });
            
            // Insert batch
            if (batch.length >= batchSize) {
                await insertBatch(client, batch);
                insertCount += batch.length;
                process.stdout.write(`\r  Imported: ${insertCount} zip codes`);
                batch = [];
            }
        }
        
        // Insert remaining
        if (batch.length > 0) {
            await insertBatch(client, batch);
            insertCount += batch.length;
        }
        
        console.log(`\n✓ Imported ${insertCount} zip codes`);
        
        // Commit transaction
        await client.query('COMMIT');
        console.log('✓ Transaction committed');
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Insert batch of zip codes
 */
async function insertBatch(client, batch) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    for (const row of batch) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
        values.push(row.zipCode, row.city, row.state, row.latitude, row.longitude);
        paramIndex += 5;
    }
    
    const query = `
        INSERT INTO zip_codes (zip, city, state, latitude, longitude)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (zip) DO UPDATE SET
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude
    `;
    
    await client.query(query, values);
}

/**
 * Alternative: Generate sample data for testing
 */
async function generateSampleData() {
    console.log('📝 Generating sample zip code data...');
    
    const client = await pool.connect();
    
    // Major US cities sample data
    const sampleZips = [
        // New York
        { zip: '10001', city: 'New York', state: 'NY', lat: 40.7484, lng: -73.9967 },
        { zip: '10002', city: 'New York', state: 'NY', lat: 40.7157, lng: -73.9863 },
        { zip: '10003', city: 'New York', state: 'NY', lat: 40.7317, lng: -73.9892 },
        // Los Angeles
        { zip: '90001', city: 'Los Angeles', state: 'CA', lat: 33.9425, lng: -118.2551 },
        { zip: '90002', city: 'Los Angeles', state: 'CA', lat: 33.9490, lng: -118.2473 },
        { zip: '90210', city: 'Beverly Hills', state: 'CA', lat: 34.0901, lng: -118.4065 },
        // Chicago
        { zip: '60601', city: 'Chicago', state: 'IL', lat: 41.8819, lng: -87.6278 },
        { zip: '60602', city: 'Chicago', state: 'IL', lat: 41.8833, lng: -87.6298 },
        // Houston
        { zip: '77001', city: 'Houston', state: 'TX', lat: 29.7543, lng: -95.3539 },
        { zip: '77002', city: 'Houston', state: 'TX', lat: 29.7537, lng: -95.3593 },
        { zip: '77003', city: 'Houston', state: 'TX', lat: 29.7366, lng: -95.3468 },
        { zip: '77004', city: 'Houston', state: 'TX', lat: 29.7284, lng: -95.3622 },
        { zip: '77005', city: 'Houston', state: 'TX', lat: 29.7174, lng: -95.4192 },
        { zip: '77006', city: 'Houston', state: 'TX', lat: 29.7424, lng: -95.3932 },
        { zip: '77007', city: 'Houston', state: 'TX', lat: 29.7737, lng: -95.4102 },
        { zip: '77008', city: 'Houston', state: 'TX', lat: 29.7982, lng: -95.4149 },
        { zip: '77019', city: 'Houston', state: 'TX', lat: 29.7528, lng: -95.4156 },
        { zip: '77024', city: 'Houston', state: 'TX', lat: 29.7706, lng: -95.4808 },
        { zip: '77030', city: 'Houston', state: 'TX', lat: 29.7092, lng: -95.4017 },
        { zip: '77056', city: 'Houston', state: 'TX', lat: 29.7444, lng: -95.4673 },
        // Phoenix
        { zip: '85001', city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0773 },
        { zip: '85002', city: 'Phoenix', state: 'AZ', lat: 33.4390, lng: -112.0823 },
        // Philadelphia
        { zip: '19101', city: 'Philadelphia', state: 'PA', lat: 39.9543, lng: -75.1638 },
        { zip: '19102', city: 'Philadelphia', state: 'PA', lat: 39.9519, lng: -75.1658 },
        // San Antonio
        { zip: '78201', city: 'San Antonio', state: 'TX', lat: 29.4683, lng: -98.5254 },
        { zip: '78202', city: 'San Antonio', state: 'TX', lat: 29.4336, lng: -98.4666 },
        // San Diego
        { zip: '92101', city: 'San Diego', state: 'CA', lat: 32.7194, lng: -117.1628 },
        { zip: '92102', city: 'San Diego', state: 'CA', lat: 32.7148, lng: -117.1204 },
        // Dallas
        { zip: '75201', city: 'Dallas', state: 'TX', lat: 32.7872, lng: -96.7985 },
        { zip: '75202', city: 'Dallas', state: 'TX', lat: 32.7867, lng: -96.8001 },
        // San Jose
        { zip: '95101', city: 'San Jose', state: 'CA', lat: 37.3361, lng: -121.8906 },
        { zip: '95110', city: 'San Jose', state: 'CA', lat: 37.3414, lng: -121.9018 },
        // Austin
        { zip: '78701', city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
        { zip: '78702', city: 'Austin', state: 'TX', lat: 30.2631, lng: -97.7219 },
        // Denver
        { zip: '80201', city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
        { zip: '80202', city: 'Denver', state: 'CO', lat: 39.7527, lng: -105.0002 },
        // Seattle
        { zip: '98101', city: 'Seattle', state: 'WA', lat: 47.6097, lng: -122.3331 },
        { zip: '98102', city: 'Seattle', state: 'WA', lat: 47.6324, lng: -122.3217 },
        // Boston
        { zip: '02101', city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
        { zip: '02102', city: 'Boston', state: 'MA', lat: 42.3388, lng: -71.0326 },
        // Miami
        { zip: '33101', city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
        { zip: '33102', city: 'Miami', state: 'FL', lat: 25.7810, lng: -80.2256 },
        // Atlanta
        { zip: '30301', city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880 },
        { zip: '30302', city: 'Atlanta', state: 'GA', lat: 33.7570, lng: -84.3963 },
    ];
    
    try {
        await client.query('BEGIN');
        
        for (const zip of sampleZips) {
            await client.query(`
                INSERT INTO zip_codes (zip, city, state, latitude, longitude)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (zip) DO UPDATE SET
                    city = EXCLUDED.city,
                    state = EXCLUDED.state,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude
            `, [zip.zip, zip.city, zip.state, zip.lat, zip.lng]);
        }
        
        await client.query('COMMIT');
        console.log(`✓ Inserted ${sampleZips.length} sample zip codes`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🏁 US Zip Code Importer');
    console.log('========================\n');
    
    try {
        // Test database connection
        const result = await pool.query('SELECT NOW()');
        console.log('✓ Database connected:', result.rows[0].now);
        
        // Check if local file exists
        if (fs.existsSync(LOCAL_ZIP_FILE)) {
            console.log('📁 Using local zip code file');
            await importZipCodes();
        } else {
            // Try to download
            try {
                await downloadZipData();
                await importZipCodes();
            } catch (downloadError) {
                console.log('⚠️  Download failed, using sample data:', downloadError.message);
                await generateSampleData();
            }
        }
        
        // Verify import
        const count = await pool.query('SELECT COUNT(*) FROM zip_codes');
        console.log(`\n✅ Total zip codes in database: ${count.rows[0].count}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, generateSampleData };
