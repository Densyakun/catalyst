import { loadEnvConfig } from '@next/env';

// Load Next.js environment variables from .env.local
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function initAdmin() {
  console.log('==================================================');
  console.log('           Catalyst Admin Initializer            ');
  console.log('==================================================');
  
  const appMode = process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || 'single';
  console.log(`Current APP_MODE : ${appMode}`);

  if (appMode !== 'single') {
    console.log('Status: Skipped. Admin auto-creation is only enabled in "single" mode.');
    return;
  }

  const email = process.env.DEFAULT_ADMIN_EMAIL;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Error: DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD is not defined in environment variables.');
    process.exit(1);
  }

  try {
    // Dynamically import supabaseAdmin AFTER environment variables are fully loaded
    const { supabaseAdmin } = await import('../src/lib/supabase-server');

    console.log('Connecting to Supabase Auth to check for existing users...');
    const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      throw listError;
    }

    const users = data.users || [];
    console.log(`Existing users count: ${users.length}`);

    if (users.length > 0) {
      console.log('Status: Skipped. Users already exist in the database.');
      return;
    }

    console.log(`Creating default admin user: ${email}...`);
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin', is_admin: true }
    });

    if (createError) {
      throw createError;
    }

    if (!user) {
      throw new Error('Failed to create admin user (user object is empty).');
    }

    console.log(`Successfully created Auth User with ID: ${user.id}`);

    // Try to create profile row in the 'profiles' table if it exists.
    // This is optional since 'profiles' table might not exist in the database schema.
    console.log('Checking for database "profiles" table and attempting to insert profile row...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        is_admin: true,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      // PGRST301 is usually "relation does not exist" or similar API error if table is missing.
      if (profileError.code === 'PGRST301' || profileError.message?.includes('relation "public.profiles" does not exist')) {
        console.log('Notice: "profiles" table does not exist. Skipping profile row creation (this is expected if you haven\'t defined a profiles table).');
      } else {
        console.warn('Warning: Encountered error while writing profile row:', profileError.message);
        console.log('This can be ignored if your database does not have a "profiles" schema or uses different columns.');
      }
    } else {
      console.log('Successfully inserted admin row into the "profiles" table!');
    }

    console.log('==================================================');
    console.log('Admin initialization completed successfully!');
    console.log('==================================================');

  } catch (err: any) {
    console.error('Fatal Error during admin initialization:');
    console.error(err.message || err);
    process.exit(1);
  }
}

initAdmin();
