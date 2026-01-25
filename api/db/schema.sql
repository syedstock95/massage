-- Massage Therapist Directory Database Schema
-- PostgreSQL

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "earthdistance";

-- Users table (both consumers and therapists)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'consumer' CHECK (role IN ('consumer', 'therapist', 'admin')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zip codes reference table (US)
CREATE TABLE zip_codes (
    zip VARCHAR(10) PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    state_name VARCHAR(100),
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    timezone VARCHAR(50),
    county VARCHAR(100)
);

-- Create index for geo queries
CREATE INDEX idx_zip_codes_location ON zip_codes USING gist (ll_to_earth(latitude, longitude));
CREATE INDEX idx_zip_codes_state ON zip_codes(state);
CREATE INDEX idx_zip_codes_city ON zip_codes(city);

-- Therapist profiles
CREATE TABLE therapists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200),
    bio TEXT,
    profile_image VARCHAR(500),
    license_number VARCHAR(100),
    license_state VARCHAR(2),
    years_experience INTEGER,
    
    -- Location
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(10) REFERENCES zip_codes(zip),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    service_radius_miles INTEGER DEFAULT 25,
    
    -- Contact
    phone VARCHAR(20),
    website VARCHAR(255),
    
    -- Business settings
    accepts_new_clients BOOLEAN DEFAULT TRUE,
    offers_mobile BOOLEAN DEFAULT FALSE,
    
    -- Subscription
    subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'premium')),
    subscription_status VARCHAR(20) DEFAULT 'active',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    
    -- Stats
    rating_average DECIMAL(2,1) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    booking_count INTEGER DEFAULT 0,
    
    -- Status
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_therapists_location ON therapists USING gist (ll_to_earth(latitude, longitude));
CREATE INDEX idx_therapists_zip ON therapists(zip);
CREATE INDEX idx_therapists_state ON therapists(state);
CREATE INDEX idx_therapists_active ON therapists(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_therapists_subscription ON therapists(subscription_tier);

-- Massage service types
CREATE TABLE service_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default service types
INSERT INTO service_types (name, description, icon) VALUES
('Swedish Massage', 'Gentle, relaxing full-body massage using long strokes', 'spa'),
('Deep Tissue', 'Firm pressure targeting deep muscle layers', 'fitness'),
('Hot Stone', 'Heated stones placed on body for deep relaxation', 'whatshot'),
('Sports Massage', 'Focused on athletic performance and recovery', 'sports'),
('Thai Massage', 'Stretching and pressure point techniques', 'self_improvement'),
('Prenatal', 'Safe massage for expecting mothers', 'pregnant_woman'),
('Reflexology', 'Pressure point therapy on feet and hands', 'back_hand'),
('Aromatherapy', 'Essential oils combined with massage', 'local_florist'),
('Couples Massage', 'Side-by-side massage for two', 'favorite'),
('Chair Massage', 'Quick massage while seated, great for offices', 'chair'),
('Lymphatic Drainage', 'Gentle massage to promote lymph flow', 'water_drop'),
('Trigger Point', 'Focused pressure on tight muscle knots', 'adjust'),
('Myofascial Release', 'Stretching the fascia connective tissue', 'accessibility'),
('Cupping', 'Suction cups to promote blood flow', 'circle'),
('Shiatsu', 'Japanese finger pressure technique', 'touch_app');

-- Therapist services (what each therapist offers)
CREATE TABLE therapist_services (
    id SERIAL PRIMARY KEY,
    therapist_id UUID REFERENCES therapists(id) ON DELETE CASCADE,
    service_type_id INTEGER REFERENCES service_types(id),
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(therapist_id, service_type_id, duration_minutes)
);

CREATE INDEX idx_therapist_services_therapist ON therapist_services(therapist_id);

-- Therapist availability
CREATE TABLE therapist_availability (
    id SERIAL PRIMARY KEY,
    therapist_id UUID REFERENCES therapists(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(therapist_id, day_of_week, start_time)
);

CREATE INDEX idx_availability_therapist ON therapist_availability(therapist_id);

-- Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    therapist_id UUID REFERENCES therapists(id) ON DELETE SET NULL,
    consumer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    service_id INTEGER REFERENCES therapist_services(id),
    
    -- Booking details
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    
    -- Consumer info (in case not registered)
    consumer_name VARCHAR(200),
    consumer_email VARCHAR(255),
    consumer_phone VARCHAR(20),
    
    -- Location
    location_type VARCHAR(20) DEFAULT 'in_studio' CHECK (location_type IN ('in_studio', 'mobile', 'virtual')),
    location_address TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
    notes TEXT,
    
    -- Notifications
    reminder_sent BOOLEAN DEFAULT FALSE,
    confirmation_sent BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_therapist ON bookings(therapist_id);
CREATE INDEX idx_bookings_consumer ON bookings(consumer_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    therapist_id UUID REFERENCES therapists(id) ON DELETE CASCADE,
    consumer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE, -- verified if linked to actual booking
    therapist_response TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviews_therapist ON reviews(therapist_id);

-- Therapist gallery images
CREATE TABLE therapist_images (
    id SERIAL PRIMARY KEY,
    therapist_id UUID REFERENCES therapists(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    caption VARCHAR(200),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription plans
CREATE TABLE subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_yearly DECIMAL(10,2),
    features JSONB,
    stripe_price_id_monthly VARCHAR(100),
    stripe_price_id_yearly VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, features) VALUES
('free', 'Free Listing', 0, 0, '{"listing": true, "contact_form": true, "max_services": 3}'),
('pro', 'Pro', 49.00, 470.00, '{"listing": true, "contact_form": true, "online_booking": true, "calendar": true, "reminders": true, "max_services": 10, "priority_listing": true}'),
('premium', 'Premium', 99.00, 950.00, '{"listing": true, "contact_form": true, "online_booking": true, "calendar": true, "reminders": true, "crm": true, "analytics": true, "marketing_tools": true, "max_services": -1, "featured_listing": true, "priority_support": true}');

-- Function to update therapist rating
CREATE OR REPLACE FUNCTION update_therapist_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE therapists
    SET 
        rating_average = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE therapist_id = NEW.therapist_id AND is_visible = TRUE),
        rating_count = (SELECT COUNT(*) FROM reviews WHERE therapist_id = NEW.therapist_id AND is_visible = TRUE)
    WHERE id = NEW.therapist_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_therapist_rating();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_therapists_timestamp BEFORE UPDATE ON therapists FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_bookings_timestamp BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_timestamp();
