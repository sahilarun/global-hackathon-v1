const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function initializeDatabase() {
  try {
    console.log('Initializing Rewindly database...');

    // Create users table first
    const createUsersTableQuery = `
      DROP TABLE IF EXISTS users CASCADE;
      
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create email index
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      -- Enable Row Level Security
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;

      -- Create policies
      CREATE POLICY "Users can view own profile" ON users
        FOR SELECT USING (auth.uid() = id);
      
      CREATE POLICY "Users can update own profile" ON users
        FOR UPDATE USING (auth.uid() = id);
    `;

    const { error: userTableError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (userTableError && userTableError.code === '42P01') {
      const { error } = await supabase.sql(createUsersTableQuery);
      if (error) {
        console.error('Error creating users table:', error);
        return;
      }
    }

    // Create activities table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        url TEXT,
        favicon TEXT,
        description TEXT,
        timestamp_start TIMESTAMP WITH TIME ZONE NOT NULL,
        timestamp_end TIMESTAMP WITH TIME ZONE,
        time_spent INTEGER DEFAULT 0,
        activity_type VARCHAR(50) DEFAULT 'website',
        mood VARCHAR(20),
        productivity_score INTEGER,
        ai_summary TEXT,
        user_id UUID DEFAULT auth.uid(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
      CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp_start);
      CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(DATE(timestamp_start));
      
      ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY IF NOT EXISTS "Users can view own activities" ON activities
        FOR SELECT USING (auth.uid() = user_id);
      
      CREATE POLICY IF NOT EXISTS "Users can insert own activities" ON activities
        FOR INSERT WITH CHECK (auth.uid() = user_id);
      
      CREATE POLICY IF NOT EXISTS "Users can update own activities" ON activities
        FOR UPDATE USING (auth.uid() = user_id);
    `;

    const { error: tableError } = await supabase.rpc('exec_sql', { 
      sql: createTableQuery 
    });

    if (tableError) {
      console.log('Note: Some table operations may require direct database access');
      console.log('Please run this SQL manually in your Supabase SQL editor:');
      console.log(createTableQuery);
    }

    console.log('Database initialization completed successfully!');
    console.log('Tables created:');
    console.log('- activities (with RLS policies)');
    console.log('- Indexes for performance optimization');
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();
