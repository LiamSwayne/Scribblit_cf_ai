// @ts-nocheck
const WORKER_DOMAIN = 'auth9.unrono.workers.dev';
const STRIPE_WORKER_DOMAIN = 'stripe.unrono.workers.dev';
const PAGES_DOMAIN = 'unrono.com'; // unrono.com built on top of pages at unrono3.pages.dev
const R2_IMAGES_DOMAIN = 'product-images.unrono.com';
const R2_THUMBNAILS_DOMAIN = 'user-product-thumbnails.unrono.com';
const R2_SAMPLES_DOMAIN = 'sample-files.unrono.com'; 
const R2_PROFILE_PICTURES_DOMAIN = 'profile-pictures.unrono.com';
const TAGS = ['3D model','Art','Video game','Wallpaper','App','Video','Ebook','Software tool', 'Template', 'Font'];
const CLIENT_SIDE_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB product max size
const SUMMED_PHOTO_SIZE_LIMIT = 25 * 1024 * 1024; // 24 MB max summed photo size plus 1 MB wiggle room
const THUMBNAILS_PER_PAGE = 30;
const INITIAL_UPLOAD_SLOTS = 100;
const MAX_PRODUCTS = 200;
const PROFILE_PICTURE_SIZE = 300; // 300x300
const STRIPE_PUBLIC_KEY = 'pk_live_51OCl2CICKmAj9R8kfYV76izJN9Tg8pV6q6aAtrGhIwlBCe0VTkEjeNUw1ArfWEagwxWieJFvSXbqnY9gH3Iu0Wp600JKPeCPRd';
const VALID_COUNTRIES = {
  'AU': 'Australia',
  'AT': 'Austria',
  'BE': 'Belgium',
  'BR': 'Brazil',
  'BG': 'Bulgaria',
  'CA': 'Canada',
  'HR': 'Croatia',
  'CY': 'Cyprus',
  'CZ': 'Czech Republic',
  'DK': 'Denmark',
  'EE': 'Estonia',
  'FI': 'Finland',
  'FR': 'France',
  'DE': 'Germany',
  'GI': 'Gibraltar',
  'GR': 'Greece',
  'HK': 'Hong Kong',
  'HU': 'Hungary',
  'IN': 'India',
  'ID': 'Indonesia',
  'IE': 'Ireland',
  'IT': 'Italy',
  'JP': 'Japan',
  'LV': 'Latvia',
  'LI': 'Liechtenstein',
  'LT': 'Lithuania',
  'LU': 'Luxembourg',
  'MY': 'Malaysia',
  'MT': 'Malta',
  'MX': 'Mexico',
  'NL': 'Netherlands',
  'NZ': 'New Zealand',
  'NO': 'Norway',
  'PL': 'Poland',
  'PT': 'Portugal',
  'RO': 'Romania',
  'SG': 'Singapore',
  'SK': 'Slovakia',
  'SI': 'Slovenia',
  'ES': 'Spain',
  'SE': 'Sweden',
  'CH': 'Switzerland',
  'TH': 'Thailand',
  'AE': 'United Arab Emirates',
  'GB': 'United Kingdom',
  'US': 'United States'
};
const PRODUCT_CATEGORIES = {
  "VIDEO_GAMES": "txcd_10201000",
  "OTHER_RECREATIONAL_SOFTWARE": "txcd_10202000",
  "OTHER_SOFTWARE_TOOL": "txcd_10202001|txcd_10202003", // personal use is txcd_10202001, commercial use is txcd_10202003, with both it's "txcd_10202001|txcd_10202003"
  "OTHER_NON-RECREATIONAL_NON-TOOL_SOFTWARE": "txcd_10000000",
  "AUDIOBOOKS": "txcd_10301000",
  "DIGITAL_BOOKS": "txcd_10302000",
  "DIGITAL_MAGAZINES": "txcd_10303100",
  "DIGITAL_NEWSPAPERS": "txcd_10304000",
  "DIGITAL_TEXTBOOKS": "txcd_10305001",
  "DIGITAL_AUDIO_WORKS": "txcd_10401100",
  "DIGITAL_AUDIO_VISUAL_WORKS": "txcd_10402100",
  "DIGITAL_PHOTOGRAPHS": "txcd_10501000",
  "DIGITAL_NEWS_DOCUMENTS": "txcd_10503004",
  "ELECTRONIC_SOFTWARE_DOCUMENTATION": "txcd_10504003",
  "DIGITAL_ARTWORK": "txcd_10505001",
  "DIGITAL_GREETING_CARDS_AUDIO": "txcd_10506000",
  "DIGITAL_GREETING_CARDS_AUDIO_VISUAL": "txcd_10506001",
  "DIGITAL_GREETING_CARDS_VISUAL": "txcd_10506002",
};

// env.SECRET_KEY is stored as an encrypted cloudflare variable (encrypted by cloudflare, not me)

// data cannot be empty dictionary because it causes error (no clue why)
function SEND(data, status = 200, contentType = 'json', headers = {}) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // change to 'https://' + PAGES_DOMAIN if necessary, but there really is no reason since you can't host external site content using this site
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const defaultHeaders = {
    ...corsHeaders,
    ...headers,
  };

  if (contentType === 'json') {
    defaultHeaders['Content-Type'] = 'application/json';
  } else if (contentType === 'none') {
    // do not add content type header
  } else {
    data['SEND_function_error'] = 'SEND function on back-end received an invalid content type.';
    status = 451; // each error has an arbitrary unique identifier
  }

  if (data === null) {
    data = '';
  } else if (contentType === 'json') {
    data = JSON.stringify(data);
  }

  return new Response(data, {
    status,
    headers: defaultHeaders,
  });
}

async function hash(password, salt="") {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// authenticate the user on login
async function authenticate(username, password, env) {
  try {
    const result = await env.DB.prepare('SELECT password, login_timestamps, salt FROM users WHERE username = ?').bind(username).first();
    if (!result) {
      return { success: false, error: 'User not found' };
    }

    // Get the current timestamp
    const currentTimestamp = new Date();

    // Remove timestamps older than 10 minutes from the login_timestamps array
    const tenMinutesAgo = new Date(currentTimestamp.getTime() - 10 * 60 * 1000);
    let login_times = JSON.parse(result.login_timestamps);
    const updatedTimestamps = login_times.filter(timestamp => new Date(timestamp) >= tenMinutesAgo);

    // Add the current timestamp to the login_timestamps array
    updatedTimestamps.push(currentTimestamp.toISOString());

    // Update the user's login_timestamps in the database
    await env.DB.prepare('UPDATE users SET login_timestamps = ? WHERE username = ?').bind(JSON.stringify(updatedTimestamps), username).run();

    // Check if there are more than 20 login attempts within the past 10 minutes
    if (updatedTimestamps.length > 20) {
      return { success: false, error: 'Too many login attempts in a short period of time.' };
    }

    // Hash the provided password using the user's salt
    const hashedPassword = await hash(password, result.salt);

    // string types must be casted (weird javascript rule)
    if (result.password != hashedPassword) {
      return { success: false, error: 'Invalid username or password' };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ username }));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return {
      success: true,
      token: `${btoa(JSON.stringify({ username: username }))}.${signatureBase64}`,
    };
  } catch (err) {
    throw new Error('Failed to authenticate user');
  }
}

// verify the user is who they say they are
async function verifyToken(token, secret_key) {
  try {
    const [payloadBase64, signatureBase64] = token.split('.');
    const payload = JSON.parse(atob(payloadBase64));
    const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret_key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = encoder.encode(JSON.stringify(payload));
    const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!isValid) {
      return null;
    }
    return payload.username;
  } catch (err) {
    throw new Error('Failed to verify token');
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return SEND(null, 204, 'none');
    }

    switch (new URL(request.url).pathname) {
      case '/login':
        if (request.method === 'POST') {
          try {
            let { username, password } = await request.json();
            
            const result = await authenticate(username, password, env);

            if (result.success) {
              return SEND({ token: result.token }, 200);
            } else {
              return SEND({ error: result.error }, 452);
            }
          } catch (err) {
            return SEND({ error: 'Failed to process login request', details: err.message, stack: err.stack }, 453);
          }
        }
        break;

      case '/signup':
        if (request.method === 'POST') {
          try {
            let { username, password } = await request.json();

            // Check if the username contains only allowed characters
            // on the back-end we use underscores instead of spaces (this replacement is done on the front-end and checked before this function runs)
            username = username.replaceAll(' ', '_');

            const allowedUsernameCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()-_';
            for (let i = 0; i < username.length; i++) {
              if (!allowedUsernameCharacters.includes(username[i])) {
                return SEND({ success: false, error: 'Username can only contain letters, numbers, parentheses, dashes, and spaces' }, 499);
              }
            }

            // Check if the username is at least 3 characters long
            if (username.length < 3) {
              return SEND({ success: false, error: 'Username must be at least 3 characters long' }, 459);
            }

            // check if the username is longer than 40 characters
            if (username.length > 40) {
              return SEND({ success: false, error: 'Username cannot exceed 40 characters' }, 452);
            }
        
            // Check if the password contains only allowed characters
            const allowedPasswordCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>? ';
            for (let i = 0; i < password.length; i++) {
              if (!allowedPasswordCharacters.includes(password[i])) {
                return SEND({ success: false, error: 'Password can only contain English letters, numbers, and special characters' }, 456);
              }
            }
        
            // Check if the password is at least 16 characters long
            if (password.length < 16) {
              return SEND({ success: false, error: 'Password must be at least 16 characters long' }, 457);
            }
        
            // Check if password is greater than 72 characters long
            if (password.length > 72) {
              return SEND({ success: false, error: 'Maximum password length is 72 characters' }, 458);
            }

            if (username[0] === '_') {
              return SEND({ error: 'Username cannot start with a space' }, 464);
            }

            if (username[username.length-1] === '_') {
              return SEND({ error: 'Username cannot end with a space' }, 463);
            }

            // no double spaces
            if (username.includes('__')) {
              return SEND({ error: 'Username cannot contain double spaces' }, 465);
            }

            // Check the IP address count
            // IP address is checked first so people can't spam signup to figure out which usernames are taken
            const ip = request.headers.get('CF-Connecting-IP');
            const hashedIP = await hash(ip);
            const ipCount = await env.DB.prepare('SELECT accounts_created FROM ip_addresses WHERE hashed_address = ?').bind(hashedIP).first();
            if (ipCount && ipCount.accounts_created >= 5) {
              return SEND({ success: false, error: 'This IP address has already reached the limit of account creations' }, 489);
            }
        
            // Check if the username is already taken
            // selecting id because it is short and not null if the user exists
            const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (existingUser) {
              return SEND({ error: 'Username already exists' }, 459);
            }
        
            // Generate a random 12-character salt
            const salt = crypto.randomUUID().replaceAll(/-/g, '').substring(0, 12);

            // genrate a random 12-character id
            const userId = crypto.randomUUID().replaceAll(/-/g, '').substring(0, 12);

            // Hash the password using the generated salt
            const hashedPassword = await hash(password, salt);
        
            // Create a new user with default values
            await env.DB.prepare(`
              INSERT INTO users (username, password, email, listed_product_ids, purchased_product_ids_and_ratings, login_timestamps, thumbnails_zip_ids, salt, has_profile_picture, id, zip_code) VALUES (?, ?, NULL, '[]', '[]', '[]', NULL, ?, 0, ?, NULL)
            `).bind(username, hashedPassword, salt, userId).run();
        
            // Generate a token for the new user
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({ username }));
            const key = await crypto.subtle.importKey(
              'raw',
              encoder.encode(env.SECRET_KEY),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const signature = await crypto.subtle.sign('HMAC', key, data);
            const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
            const token = `${btoa(JSON.stringify({ username }))}.${signatureBase64}`;
        
            // Update the IP address count
            if (ipCount) {
              const updatedCount = ipCount.accounts_created + 1;
              await env.DB.prepare('UPDATE ip_addresses SET accounts_created = ? WHERE hashed_address = ?').bind(updatedCount, hashedIP).run();
            } else {
              await env.DB.prepare('INSERT INTO ip_addresses (hashed_address, accounts_created) VALUES (?, 1)').bind(hashedIP).run();
            }
        
            return SEND({ message: 'User registered successfully', token: token }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to process signup request', details: err.message, stack: err.stack }, 462);
          }
        }
        break;

      case '/account':
        if (request.method === 'GET') {
          // Get the username from the token
          const token = request.headers.get('Authorization');

          if (!token) {
            return SEND({ error: 'Missing token in authorization header' }, 455);
          }
          try {
            const username = await verifyToken(token, env.SECRET_KEY);

            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            const result = await env.DB.prepare('SELECT email, listed_product_ids, has_profile_picture, id, stripe_account_id, country, zip_code FROM users WHERE username = ?').bind(username).first();
            if (!result) {
              return SEND({ error: 'User not found' }, 458);
            }

            // Format the email based on verification status
            let email = result.email;
            if (email) {
              const parts = email.split('|');
              email = parts[0];
              if (parts.length > 1) {
                email += '|'; // Append '|' to indicate unverified email
              }
            }

            // select listed product data
            let listedProducts = []
            for (const id of JSON.parse(result.listed_product_ids)) {
              let product = await env.DB.prepare('SELECT id, name, sales, descriptions, zip_ids, date_uploaded, visible FROM products WHERE id = ?').bind(id).first();
              if (product) {
                listedProducts.push([
                  product.id,
                  product.name,
                  product.sales,
                  product.date_uploaded,
                  product.zip_ids,
                  product.visible
                ]);
              }
            }

            return SEND({
              accountInfo: {
                username: username,
                email: email,
                stripeAccountId: result.stripe_account_id,
                country: result.country,
                zipCode: result.zip_code,
              },
              listedProducts: listedProducts,
              userId: result.id,
              hasProfilePicture: result.has_profile_picture
            }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to fetch account info', details: err.message }, 459);
          }
        }
        break;

      case '/upload-product-thumbnail':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
      
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }
      
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            const formData = await request.formData();
            const thumbnailsZip = formData.get('thumbnailsZip');
      
            // Upload the thumbnails zip to R2 storage
            const user = await env.DB.prepare('SELECT thumbnails_zip_ids FROM users WHERE username = ?').bind(username).first();
            const thumbnailsZipIds = user.thumbnails_zip_ids.split("|");
            const lastID = thumbnailsZipIds[thumbnailsZipIds.length - 1];
            await env.THUMBNAILS_BUCKET.put(lastID + '.zip', thumbnailsZip);
      
            return SEND({ message: 'Product thumbnail uploaded successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to upload product thumbnail', details: err.message }, 488);
          }
        }
        break;

      case '/upload-product-samples':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');

            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            const formData = await request.formData();

            const sampleFileTree = formData.get('sampleFileTree');
            if (!sampleFileTree) {
              return SEND({ error: 'Sample file tree not found' }, 487);
            }

            const samplesZip = formData.get('samplesZip');
            if (!samplesZip) {
              return SEND({ error: 'No samples zip file found' }, 487);
            }

            if (samplesZip.size > CLIENT_SIDE_SIZE_LIMIT) {
              return SEND({ error: 'Uploaded samples zip exceeds the size limit' }, 487);
            }

            // verify that the product is owned by the user
            const productId = formData.get('productId');
            const product = await env.DB.prepare('SELECT creator_id, file_tree FROM products WHERE id = ?').bind(productId).first();

            // get the user's id
            const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();

            if (product.creator_id != user.id) {
              return SEND({ error: 'Product does not belong to user' }, 460);
            }

            // make sure they aren't uploading the entire product as a sample
            if (JSON.parse(product.file_tree).length === JSON.parse(sampleFileTree).length) {
              return SEND({ error: 'Cannot upload complete product as a sample' }, 487);
            }

            // Generate a unique 12-character ID for the samples zip
            const samplesZipId = crypto.randomUUID().replace(/-/g, '').substring(0, 12);

            // Upload the samples zip to the SAMPLES_BUCKET
            await env.SAMPLES_BUCKET.put(samplesZipId + '.zip', samplesZip);

            // Update the product row in the "products" table with the samples zip ID and sample file tree
            await env.DB.prepare('UPDATE products SET sample_zip_id = ? WHERE id = ?').bind(samplesZipId + sampleFileTree, productId).run();

            return SEND({ message: 'Product samples uploaded successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to upload product samples', details: err.message }, 488);
          }
        }
        break;

      case '/update-product':
        if (request.method === 'POST') {
          try {
            // Get the username from the token
            const token = request.headers.get('Authorization');
      
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }
      
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            const formData = await request.formData();
            const productId = formData.get('productId');
      
            // Check if the product exists
            const product = await env.DB.prepare('SELECT descriptions, zip_ids, date_uploaded, decompressed_folder_size, name, file_tree, creator_id, sales_private_data FROM products WHERE id = ?').bind(productId).first();

            if (!product) {
              return SEND({ error: 'Product not found' }, 459);
            }

            // check if the user is the creator of the product
            const user = await env.DB.prepare('SELECT id, listed_product_ids, thumbnails_zip_ids FROM users WHERE username = ?').bind(username).first();

            if (!user) {
              return SEND({ error: 'User not found' }, 458);
            }

            if (user.id != product.creator_id) {
              return SEND({ error: 'Product was not created by this user' }, 460);
            }
      
            // Check if the update text is provided and within the allowed length
            const updateText = formData.get('updateText');
            if (!updateText || updateText.trim().length === 0) {
              return SEND({ success: false, error: 'Update text is required' }, 483);
            }
      
            if (updateText.length < 5) {
              return SEND({ success: false, error: 'Update text must be at least 5 characters long' }, 481);
            }
      
            if (updateText.length > 1000) {
              return SEND({ success: false, error: 'Update text cannot exceed 1000 characters' }, 482);
            }
      
            if (formData.get('zipFile') == null || formData.get('zipFile').size == 0) {
              return SEND({ success: false, error: 'No product files found' }, 487);
            }
      
            // Check if the uploaded folder is within the size limit
            if (formData.get('zipFile').size > CLIENT_SIDE_SIZE_LIMIT) {
              return SEND({ success: false, error: 'Uploaded folder zip exceeds the 100MB size limit' }, 487);
            }
      
            let updateName = formData.get('updateName');
      
            if (!updateName) {
              return SEND({ success: false, error: 'Update name is required' }, 488);
            }
      
            if (updateName.length > 100) {
              return SEND({ success: false, error: 'Update name cannot exceed 100 characters' }, 489);
            }
      
            if (updateName.length < 5) {
              return SEND({ success: false, error: 'Update name must be at least 5 characters long' }, 490);
            }
      
            if (updateName[0] === ' ') {
              return SEND({ success: false, error: 'Update name cannot start with a space' }, 491);
            }
      
            if (updateName[updateName.length-1] === ' ') {
              return SEND({ success: false, error: 'Update name cannot end with a space' }, 492);
            }
      
            if (updateName.includes('@')) {
              return SEND({ success: false, error: 'Update name cannot contain the "@" character' }, 493);
            }
      
            // Calculate the total number of sales and uploads
            const listedProductIds = JSON.parse(user.listed_product_ids);
            let totalSales = 0;
            let uploadsAndUpdates = 0;
            for (const productId of listedProductIds) {
              const listedProduct = await env.DB.prepare('SELECT sales, date_uploaded FROM products WHERE id = ?').bind(productId).first();
              
              // add the number of uploads and updates for the product
              // data is stored like "date_1|date_2|date_3" etc, so split by '|' to get the count of updates + original upload
              uploadsAndUpdates += listedProduct.date_uploaded.split('|').length;
              
              // sales column is null when there are zero sales
              if (listedProduct && listedProduct.sales) {
                const sales = listedProduct.sales.split('@').length;
                totalSales += sales;
              }
            }
            // Calculate the available upload slots
            const availableSlots = Math.min(INITIAL_UPLOAD_SLOTS + totalSales, MAX_PRODUCTS) - uploadsAndUpdates;
            if (availableSlots <= 0) {
              return SEND({ success: false, error: 'No available upload slots' }, 495);
            }
      
            // Generate a unique 12-character ID for the R2 product object
            const zipId = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
      
            // Upload the zipped file to Cloudflare R2 storage using the zip ID
            const updatedProduct = formData.get('zipFile');
            await env.PRODUCTS_BUCKET.put(zipId + '.zip', updatedProduct);
      
            // Append the update text to the descriptions array
            const descriptions = JSON.parse(product.descriptions);
            descriptions.push(updateText);
      
            // Append the new zip ID to the zip_ids array
            const zipIds = JSON.parse(product.zip_ids);
            zipIds.push(zipId);
      
            // Append the update time to the date_uploaded string
            const currentTime = Date.now().toString();
            const dateUploaded = product.date_uploaded + '|' + currentTime;
      
            // Append the updated folder size to the decompressed_folder_size string
            const updatedFolderSize = formData.get('zipFile').size.toString();
            const decompressedFolderSize = product.decompressed_folder_size + '|' + updatedFolderSize;
      
            // Append the update name to the name string
            const updateNames = product.name + '@' + updateName;
      
            // Merge the updated file tree with the existing file tree
            const existingFileTree = JSON.parse(product.file_tree);
            const updateFileTree = JSON.parse(formData.get('fileTree'));
      
            // Combine the file trees and remove duplicates
            const mergedFileTree = [...new Set([...existingFileTree, ...updateFileTree])];

            // Reset download times for all buyers
            if (product && product.sales_private_data) {
              const privateData = JSON.parse(product.sales_private_data);
              privateData[1] = privateData[1].map(() => 0);
              await env.DB.prepare('UPDATE products SET sales_private_data = ? WHERE id = ?')
                .bind(JSON.stringify(privateData), productId)
                .run();

              // Send update emails to buyers
              for (const buyerEmail of privateData[0]) {
                // Get the product version names
                const versionNames = product.name.split('@');
                const productName = versionNames[0];

                // Generate the download buttons for each version
                const downloadButtons = versionNames.map((name, index) => {
                  let sentName = name;
                  if (versionNames.length > 1 && index == 0) {
                    sentName = 'Original product';
                  }

                  const zipId = JSON.parse(product.zip_ids)[index];
                  const downloadUrl = `https://${WORKER_DOMAIN}/download-from-email?email=${encodeURIComponent(buyerEmail)}&productId=${productId}&zipId=${zipId}`;
                  return `<a href="${downloadUrl}" style="display: inline-block; margin-bottom: 10px; text-decoration: none; background-color: #ff1584; color: white; padding: 10px 20px; border-radius: 5px; font-weight: bold;">${sentName}</a>`;
                });

                // Generate the star rating buttons
                const starRatingButtons = [1, 2, 3, 4, 5].map(stars => {
                  const yellowStars = '★'.repeat(stars);
                  const greyStars = '☆'.repeat(5 - stars);
                  return `<a href="https://${WORKER_DOMAIN}/rate-product?email=${encodeURIComponent(buyerEmail)}&productId=${productId}&rating=${stars}" style="text-decoration: none; color: #FFD700; font-size: 24px; margin-right: 10px;">${yellowStars}${greyStars}</a>`;
                }).join('');

                // Determine the appropriate text based on the number of versions
                const downloadText = versionNames.length > 1 ? 'Download your updated product using the buttons below:' : 'Download your updated product using the button below:';

                // Send the update email to the buyer
                await fetch('https://api.mailchannels.net/tx/v1/send', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    personalizations: [
                      { to: [{ email: buyerEmail, name: buyerEmail }] }
                    ],
                    from: { email: 'noreply@unrono.com', name: 'Unrono' },
                    subject: `${user.username.replaceAll("_"," ")} - ${versionNames[0]} has been updated`,
                    content: [{
                      type: 'text/html',
                      value: `
                        <body style="font-family: 'Courier New'; text-align: center; margin: 0 0; background-color: #4d7cff; border-radius: 30px;">
                          <style>
                            @import url('https://${PAGES_DOMAIN}/RubikDoodleShadow-Regular.woff2');
                          </style>
                          <div style="height:20px"></div>
                          <div style="background-color: #ffffff; display: inline-block; padding: 0px 20px; border-radius: 10px;">
                            <p style="font-weight: 900; font-size: 24px; font-weight: bold;">${productName}</p>
                            <p style="font-weight: 900; font-size: 18px;">The product you purchased from ${user.username.replaceAll("_"," ")} has been updated.</p>
                            <p style="font-weight: 900; font-size: 18px;">${downloadText}</p>
                            ${downloadButtons.join('<br><div style="height:4px"></div><br>')}
                            <p style="font-weight: 900; font-size: 18px;">Rate this product:</p>
                            ${starRatingButtons}
                          </div>
                          <div style="height:20px"></div>
                          <div style="background-color: #ffffff; display: inline-block; padding: 0px 20px; border-radius: 10px; padding-bottom: 16px;">
                            <p style="font-weight: 900; font-size: 18px; font-weight: bold;">The download links will expire in 24 hours.</p>
                            <p style="font-weight: 900; font-size: 12px;">If you believe this product violates Unrono's terms of service, reach out to <a href="mailto:contact@unrono.com" style="color: #ff1584;">contact@unrono.com</a>.</p>
                            <a style="font-weight: 900; font-size: 12px;" href="/terms_of_service#:~:text=All%20purchases%20are%20non%2Drefundable">Refund Policy</a>
                          </div>
                        </body>
                      `
                    }]
                  })
                });
              }
            }

            // Update the product in the "products" table
            await env.DB.prepare(`UPDATE products SET descriptions = ?, zip_ids = ?, file_tree = ?, date_uploaded = ?, decompressed_folder_size = ?, name = ? WHERE id = ?`)
              .bind(
                JSON.stringify(descriptions),
                JSON.stringify(zipIds),
                JSON.stringify(mergedFileTree),
                dateUploaded,
                decompressedFolderSize,
                updateNames,
                productId
              ).run();
      
            return SEND({ message: 'Product updated successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to update product', details: err.message }, 488);
          }
        }
        break;

      case '/update-product-samples':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            const formData = await request.formData();
            const sampleFileTree = formData.get('sampleFileTree');
            if (!sampleFileTree) {
              return SEND({ error: 'Sample file tree not found' }, 487);
            }

            const samplesZip = formData.get('samplesZip');
            if (!samplesZip) {
              return SEND({ error: 'No samples zip file found' }, 487);
            }

            if (samplesZip.size > CLIENT_SIDE_SIZE_LIMIT) {
              return SEND({ error: 'Uploaded samples zip exceeds the size limit' }, 487);
            }

            // Verify that the product is owned by the user
            const productId = formData.get('productId');
            const product = await env.DB.prepare('SELECT creator_id, file_tree, sample_zip_id FROM products WHERE id = ?').bind(productId).first();

            // Make sure they aren't uploading the entire product as a sample
            if (JSON.parse(product.file_tree).length === JSON.parse(sampleFileTree).length) {
              return SEND({ error: 'Cannot upload complete product as a sample' }, 487);
            }

            // Get the user with that id and check if the product belongs to the user
            const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (product.creator_id != user.id) {
              return SEND({ error: 'Product does not belong to user' }, 460);
            }

            // Extract the existing samples zip ID from the sample_zip_id column
            let existingSamplesZipId;

            if (!product.sample_zip_id) {
              // Generate a unique 12-character ID for the samples zip
              existingSamplesZipId = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
            } else {
              // Use the existing samples zip ID
              existingSamplesZipId = product.sample_zip_id.substring(0, 12);
            }

            // Upload the updated samples zip to the SAMPLES_BUCKET using the existing samples zip ID
            await env.SAMPLES_BUCKET.put(existingSamplesZipId + '.zip', samplesZip);

            // Update the product row in the "products" table with the updated sample file tree
            await env.DB.prepare('UPDATE products SET sample_zip_id = ? WHERE id = ?').bind(existingSamplesZipId + sampleFileTree, productId).run();

            return SEND({ message: 'Product samples updated successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to update product samples', details: err.message }, 488);
          }
        }
        break;

      case '/product-data':
        if (request.method === 'POST' || request.method === 'GET') {
          try {
            const { productId } = await request.json();
      
            // Retrieve the product data from the database
            const product = await env.DB.prepare(`
              SELECT name, descriptions, tags, distribution_option, commercial_license, personal_license, decompressed_folder_size, date_uploaded, ratings, reviews, file_tree, youtube_url, creator_id, sample_zip_id FROM products WHERE id = ? AND visible = 1
            `).bind(productId).first();
      
            if (!product) {
              return SEND({ error: 'Product not found' }, 491);
            }
      
            // Get the creator's username
            const creator = await env.DB.prepare('SELECT username, has_profile_picture FROM users WHERE id = ?').bind(product.creator_id).first();
      
            // Prepare the product data to send back to the client
            const productData = {
              name: product.name,
              descriptions: product.descriptions,
              tags: product.tags,
              distributionOption: product.distribution_option,
              commercialLicense: product.commercial_license,
              personalLicense: product.personal_license,
              decompressedFolderSize: product.decompressed_folder_size,
              dateUploaded: product.date_uploaded,
              ratings: product.ratings,
              reviews: product.reviews,
              fileTree: product.file_tree,
              youtubeUrl: product.youtube_url,
              creator: creator.username,
              userId: product.creator_id,
              hasProfilePicture: creator.has_profile_picture,
              sampleZipId: product.sample_zip_id
            };
      
            return SEND(productData);
          } catch (err) {
            return SEND({ error: 'Failed to retrieve product data', details: err.message }, 500);
          }
        }
        break;

      case '/user-products':
        if (request.method === 'POST') {
          try {
            const { username } = await request.json();
      
            if (!username) {
              return SEND({ error: 'Missing username in request payload' }, 455);
            }
      
            // Retrieve the user's account information from the database
            const user = await env.DB.prepare('SELECT id, has_profile_picture, listed_product_ids, thumbnails_zip_ids FROM users WHERE username = ?').bind(username).first();
            if (!user) {
              return SEND({ error: 'User not found' }, 458);
            }
      
            // Retrieve the user's listed product IDs
            const listedProductIds = JSON.parse(user.listed_product_ids);
      
            // Retrieve the product names and IDs from the "products" table
            const products = [];
            for (const productId of listedProductIds) {
              const product = await env.DB.prepare('SELECT name, ratings FROM products WHERE id = ?').bind(productId).first();
              if (product) {
                products.push({ id: productId, name: product.name, ratings: product.ratings });
              }
            }
            
            return SEND({
              products: products,
              thumbnailsZipId: listedProductIds.length > 0 ? user.thumbnails_zip_ids : null,
              userId: user.id,
              hasProfilePicture: user.has_profile_picture
            }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to fetch user products', details: err.message }, 488);
          }
        }
        break;

      case '/get-product-data-for-edit':
        if (request.method === 'POST') {
          try {
            // Get the username from the token
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            const { productId } = await request.json();
      
            // Check if the product exists and belongs to the user
            const product = await env.DB.prepare('SELECT id, name, descriptions, tags, distribution_option, commercial_license, personal_license, youtube_url, creator_id FROM products WHERE id = ?').bind(productId).first();
            if (!product) {
              return SEND({ error: 'Product not found' }, 459);
            }

            // get the thumbnails zip ID
            const user = await env.DB.prepare('SELECT thumbnails_zip_ids, id FROM users WHERE username = ?').bind(username).first();

            // check if the user is the creator of the product
            if (product.creator_id != user.id) {
              return SEND({ error: 'Product was not created by this user' }, 460);
            }

            // Prepare the product data to send back to the client
            const productData = {
              productName: product.name,
              description: product.descriptions,
              distributionOption: product.distribution_option,
              commercialLicense: product.commercial_license,
              personalLicense: product.personal_license,
              tags: product.tags,
              youtubeUrl: product.youtube_url,
              thumbnailsZipIds: user.thumbnails_zip_ids
            };
            return SEND(productData);
          } catch (err) {
            return SEND({ error: 'Failed to retrieve product data for editing', details: err.message }, 500);
          }
        }
        break;

      case '/update-profile-picture':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }
      
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            const formData = await request.formData();
      
            if (!formData.get('profilePicture')) {
              return SEND({ error: 'Profile picture not found' }, 400);
            }
      
            const maxSize = 5 * 1024 * 1024; // 5MB
      
            if (formData.get('profilePicture').size > maxSize) {
              return SEND({ error: 'Profile picture exceeds the maximum size limit of 5MB' }, 400);
            }

            const profilePictureFile = formData.get('profilePicture');
      
            // Get the user's ID and has_profile_picture status from the "users" table
            const user = await env.DB.prepare('SELECT id, has_profile_picture FROM users WHERE username = ?')
              .bind(username)
              .first();
      
            // Delete the previous profile picture from the R2 bucket if the user already has one
            if (user.has_profile_picture == 1) {
              await env.PROFILE_PICTURES_BUCKET.delete(`${user.id}.jpg`);
            }
      
            // Upload the new profile picture to the R2 bucket using the user's ID as the key with ".jpg" extension
            await env.PROFILE_PICTURES_BUCKET.put(`${user.id}.jpg`, profilePictureFile.stream(), {
              httpMetadata: {
                contentType: profilePictureFile.type,
              },
            });
      
            // Update the user's has_profile_picture status in the "users" table
            await env.DB.prepare('UPDATE users SET has_profile_picture = 1 WHERE username = ?')
              .bind(username)
              .run();
      
            return SEND({ message: 'Profile picture updated successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to update profile picture', details: err.message }, 500);
          }
        }
        break;

      case '/remove-profile-picture':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            // Get the user's ID and has_profile_picture status from the "users" table
            const user = await env.DB.prepare('SELECT id, has_profile_picture FROM users WHERE username = ?')
              .bind(username)
              .first();

            // Delete the profile picture from the R2 bucket if the user has one
            if (user.has_profile_picture == 1) {
              await env.PROFILE_PICTURES_BUCKET.delete(`${user.id}.jpg`);
            }

            // Update the user's has_profile_picture status in the "users" table
            await env.DB.prepare('UPDATE users SET has_profile_picture = 0 WHERE username = ?')
              .bind(username)
              .run();

            return SEND({ message: 'Profile picture removed successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to remove profile picture', details: err.message }, 500);
          }
        }
        break;

      case '/download':
        if (request.method === 'POST') {
          try {
            // Get the username from the token
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            // Get the zip ID from the request body
            const { zipId } = await request.json();
      
            // Check if the user has purchased the product associated with the zip ID
            const user = await env.DB.prepare('SELECT purchased_product_ids_and_ratings FROM users WHERE username = ?')
              .bind(username)
              .first();
            const purchasedProducts = JSON.parse(user.purchased_product_ids_and_ratings);
            let productId = null;
            for (let i = 0; i < purchasedProducts.length; i++) {
              const product = await env.DB.prepare('SELECT zip_ids FROM products WHERE id = ?')
                .bind(purchasedProducts[i][0])
                .first();
              if (product && JSON.parse(product.zip_ids).includes(zipId)) {
                productId = purchasedProducts[i][0];
                break;
              }
            }

            if (!productId) {
              return SEND({ error: 'User has not purchased the product' }, 457);
            }
      
            // Retrieve the zip file from R2 storage based on the zip ID
            const object = await env.PRODUCTS_BUCKET.get(zipId + '.zip');

            if (!object) {
              return SEND({ error: 'Zip file not found' }, 458);
            }
      
            // Set the appropriate headers for the response
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Content-Disposition', 'attachment; filename="product.zip"');
      
            // Use the SEND function to return the response with the zip file
            return SEND(object.body, 200, 'none', headers);
          } catch (err) {
            return SEND({ error: 'Failed to download product', details: err.message }, 459);
          }
        }
        break;

      case '/download-own-product':
        if (request.method === 'POST') {
          try {
            // Get the username from the token
            const token = request.headers.get('Authorization');

            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }
      
            // Get the zip ID from the request body
            const { zipId } = await request.json();
      
            // Check if the user has listed the product associated with the zip ID
            const user = await env.DB.prepare('SELECT listed_product_ids FROM users WHERE username = ?')
              .bind(username)
              .first();
            const listedProductIds = JSON.parse(user.listed_product_ids);

            let productId = null;
            for (const id of listedProductIds) {
              const product = await env.DB.prepare('SELECT zip_ids FROM products WHERE id = ?')
                .bind(id)
                .first();
              if (product && JSON.parse(product.zip_ids).includes(zipId)) {
                productId = id;
                break;
              }
            }

            if (!productId) {
              return SEND({ error: 'User has not listed the product' }, 457);
            }
      
            // Retrieve the zip file from R2 storage based on the zip ID
            const object = await env.PRODUCTS_BUCKET.get(zipId + '.zip');

            if (!object) {
              return SEND({ error: 'Zip file not found' }, 458);
            }
      
            // Set the appropriate headers for the response
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Content-Disposition', 'attachment; filename="product.zip"');
      
            // Use the SEND function to return the response with the zip file
            return SEND(object.body, 200, 'none', headers);
          } catch (err) {
            return SEND({ error: 'Failed to download own product', details: err.message }, 459);
          }
        }
        break;

      case '/report-bug':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            const { bugReport } = await request.json();
            if (!bugReport || bugReport.trim() === '') {
              return SEND({ error: 'Bug report cannot be empty' }, 460);
            }
            const user = await env.DB.prepare('SELECT username FROM users WHERE username = ?').bind(username).first();
            if (!user) {
              return SEND({ error: 'User not found' }, 454);
            }
            const existingReport = await env.DB.prepare('SELECT reports FROM bug_reports WHERE username = ?').bind(username).first();
            if (existingReport) {
              const updatedReports = JSON.parse(existingReport.reports);
              updatedReports.push(bugReport);
              await env.DB.prepare('UPDATE bug_reports SET reports = ? WHERE username = ?').bind(JSON.stringify(updatedReports), username).run();
            } else {
              await env.DB.prepare('INSERT INTO bug_reports (username, reports) VALUES (?, ?)').bind(username, JSON.stringify([bugReport])).run();
            }

            return SEND({ message: 'Bug report submitted successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to submit bug report', details: err.message }, 499);
          }
        }
        break;

      case '/report-product':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 455);
            }

            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 456);
            }

            const { productId, productReport } = await request.json();
            if (!productId || !productReport || productReport.trim() === '') {
              return SEND({ error: 'Product ID and report are required' }, 460);
            }

            const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (!user) {
              return SEND({ error: 'User not found' }, 454);
            }
            const userId = user.id;
            const existingReport = await env.DB.prepare('SELECT reports FROM product_reports WHERE product_id = ?').bind(productId).first();
            if (existingReport) {
              const updatedReports = JSON.parse(existingReport.reports);
              updatedReports.push([userId, productReport]);
              await env.DB.prepare('UPDATE product_reports SET reports = ? WHERE product_id = ?').bind(JSON.stringify(updatedReports), productId).run();
            } else {
              await env.DB.prepare('INSERT INTO product_reports (product_id, reports, resolved) VALUES (?, ?, 0)').bind(productId, JSON.stringify([[userId, productReport]])).run();
            }

            return SEND({ message: 'Product report submitted successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to submit product report', details: err.message }, 499);
          }
        }
        break;

      case '/forgot-password':
        if (request.method === 'POST') {
          try {
            const { username } = await request.json();

            if (!username) {
              return SEND({ error: 'Missing username in request payload' }, 455);
            }

            const user = await env.DB.prepare('SELECT email FROM users WHERE username = ?').bind(username).first();

            if (!user) {
              return SEND({ error: 'User not found' }, 454);
            }

            if (!user.email) {
              return SEND({ error: 'User has no email associated with their account' }, 456);
            }

            const email = user.email.split('|')[0];

            const resetToken = crypto.randomUUID();

            const expirationTimestamp = Math.floor(Date.now() / 1000) + 1 * 60 * 60;
            await env.DB.prepare('UPDATE users SET reset_token = ? WHERE username = ?')
              .bind(resetToken + "|" + expirationTimestamp, username)
              .run();
            const resetUrl = `https://${PAGES_DOMAIN}/reset_password?token=${resetToken}&username=${username}`;

            // send the reset email
            // Send the verification email using MailChannels
            await fetch('https://api.mailchannels.net/tx/v1/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                personalizations: [
                  { to: [{ email, name: username }] }
                ],
                from: { email: 'noreply@unrono.com', name: 'Unrono' },
                subject: 'Password reset request',
                content: [{
                  type: 'text/html',
                  value: `
                    <body style="font-family: 'Courier New'; text-align: center; margin: 0 0; background-color: #4d7cff;">
                      <style>
                        @import url('https://${PAGES_DOMAIN}/RubikDoodleShadow-Regular.woff2');
                      </style>
                      <h1 style="color: white; font-size: 24px; margin-top: 20px;">Unrono</h1>
                      <div style="height:20px"></div>
                      <div style="background-color: #ffffff; display: inline-block; padding: 0px 20px; border-radius: 10px;">
                        <p style="font-weight: 900; font-size: 18px; font-weight: bold;">Reset password</p>
                      </div>
                      <div style="height:40px"></div>
                      <a href="${resetUrl}" style="border-radius: 10px; text-decoration: none; background-color: #ff1584; color: white; padding: 10px 20px; font-weight: bold; font-size: 16px; font-family: 'Rubik Doodle Shadow'">
                        Click to reset your password
                      </a>
                      <div style="height:40px"></div>
                      <div style="background-color: #ffffff; display: inline-block; padding: 0px 20px; border-radius: 10px;">
                        <p style="font-weight: 900; font-size: 18px; font-weight: bold;">This link expires in one hour.</p>
                      </div>
                    </body>
                  `
                }]
              })
            });

            return SEND({ message: 'Password reset email sent' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to send password reset email', details: err.message }, 499);
          }
        }
        break;

      case '/reset-password':
        if (request.method === 'POST') {
          try {
            const { token, username, password } = await request.json();

            if (!token) {
              return SEND({ error: 'Missing token in request payload' }, 455);
            }

            if (!username) {
              return SEND({ error: 'Missing username in request payload' }, 455);
            }

            if (!password) {
              return SEND({ error: 'Missing password in request payload' }, 455);
            }

            // Check if the password contains only allowed characters
            const allowedPasswordCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
            for (let i = 0; i < password.length; i++) {
              if (!allowedPasswordCharacters.includes(password[i])) {
                return SEND({ success: false, error: 'Password can only contain English letters, numbers, and special characters' }, 462);
              }
            }
        
            // Check if the password is at least 16 characters long
            if (password.length < 16) {
              return SEND({ success: false, error: 'Password must be at least 16 characters long' }, 463);
            }
        
            // Check if password is greater than 72 characters long
            if (password.length > 72) {
              return SEND({ success: false, error: 'Maximum password length is 72 characters' }, 464);
            }

            const user = await env.DB.prepare('SELECT reset_token, salt FROM users WHERE username = ?').bind(username).first();

            if (!user) {
              return SEND({ error: 'User not found' }, 454);
            }

            if (user.reset_token.split('|')[0] !== token) {
              return SEND({ error: 'Invalid or expired reset token' }, 456);
            }

            const currentTimestamp = Math.floor(Date.now() / 1000);

            if (currentTimestamp > user.reset_token.split('|')[1]) {
              return SEND({ error: 'Reset token has expired' }, 457);
            }

            const hashedPassword = await hash(password, user.salt);

            await env.DB.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_expiration = NULL WHERE username = ?')
              .bind(hashedPassword, username)
              .run();

            return SEND({ message: 'Password reset successfully' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to reset password', details: err.message }, 499);
          }
        }
        break;

      case '/download-from-email':
        if (request.method === 'GET') {
          try {
            // Get the email, product ID, and zip ID from the URL parameters
            const url = new URL(request.url);
            const email = url.searchParams.get('email');
            const productId = url.searchParams.get('productId');
            const zipId = url.searchParams.get('zipId');

            if (!email || !productId || !zipId) {
              return SEND({ error: 'Missing required parameters' }, 474);
            }

            // Check if the email has purchased the product associated with the product ID
            const product = await env.DB.prepare('SELECT zip_ids, sales_private_data FROM products WHERE id = ?').bind(productId).first();

            if (!product) {
              return SEND({ error: 'Product not found' }, 475);
            }

            const salesPrivateData = JSON.parse(product.sales_private_data);

            if (!salesPrivateData) {
              return SEND({ error: 'Email has not purchased the product' }, 476);
            }

            const [emailArray, downloadTimesArray, ratingsArray] = salesPrivateData;

            // Check if the email is in the email array
            const emailIndex = emailArray.indexOf(email);
            if (emailIndex == -1) {
              return SEND({ error: 'Email has not purchased the product' }, 477);
            }

            // Check if the download time for the email is still valid
            const currentTime = Date.now();
            if (downloadTimesArray[emailIndex] == 0) {
              downloadTimesArray[emailIndex] = currentTime + 24 * 60 * 60 * 1000; // Set to 24 hours from now
              await env.DB.prepare('UPDATE products SET sales_private_data = ? WHERE id = ?')
                .bind(JSON.stringify([emailArray, downloadTimesArray, salesPrivateData[2]]), productId)
                .run();
            } else if (currentTime > downloadTimesArray[emailIndex]) {
              return SEND({ error: 'Download link has expired' }, 455);
            }

            // Check if the zip ID is in the product's zip_ids array
            const zipIds = JSON.parse(product.zip_ids);

            if (!zipIds.includes(zipId)) {
              return SEND({ error: 'Invalid zip ID' }, 478);
            }

            // Update the download time for the email to 24 hours from now if it's currently 0
            if (downloadTimesArray[emailIndex] === 0) {
              downloadTimesArray[emailIndex] = currentTime + 24 * 60 * 60 * 1000; // Convert to milliseconds
              await env.DB.prepare('UPDATE products SET sales_private_data = ? WHERE id = ?')
                .bind(JSON.stringify([emailArray, downloadTimesArray]), productId)
                .run();
            }

            // Retrieve the zip file from R2 storage based on the zip ID
            const object = await env.PRODUCTS_BUCKET.get(zipId + '.zip');

            if (!object) {
              return SEND({ error: 'Zip file not found' }, 479);
            }

            // Set the appropriate headers for the response
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('Content-Disposition', 'attachment; filename="product.zip"');

            // Use the SEND function to return the response with the zip file
            return SEND(object.body, 200, 'none', headers);
          } catch (err) {
            return SEND({ error: 'Failed to download product', details: err.message }, 500);
          }
        }
        break;

      case '/terms-of-service-update-email':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 401);
            }
      
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username || username !== 'admin') {
              return SEND({ error: 'Unauthorized' }, 401);
            }
      
            // Retrieve all sellers' emails from the "users" table
            const sellers = await env.DB.prepare('SELECT email FROM users WHERE email IS NOT NULL').all();
      
            // Send the terms of service update email to each seller
            for (const seller of sellers) {
              // remove unverified emails
              const email = seller.email;
              if (email.contains('@@')) {
                continue;
              }
      
              // Send the email using MailChannels
              await fetch('https://api.mailchannels.net/tx/v1/send', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  personalizations: [
                    { to: [{ email, name: seller.username }] }
                  ],
                  from: { email: 'noreply@unrono.com', name: 'Unrono' },
                  subject: 'Important: Terms of Service Update',
                  content: [{
                    type: 'text/html',
                    value: `
                      <body style="font-family: Arial, sans-serif; text-align: center; margin: 0; background-color: #f5f5f5;">
                        <h1 style="color: #333333; font-size: 24px; margin-top: 20px;">Unrono</h1>
                        <div style="background-color: #ffffff; display: inline-block; padding: 20px; border-radius: 5px; margin-top: 20px;">
                          <p style="font-size: 18px; color: #333333;">Dear Seller,</p>
                          <p style="font-size: 16px; color: #666666;">We want to inform you that our Terms of Service have been updated. Please review the updated terms carefully as they may affect your use of our platform.</p>
                          <p style="font-size: 16px; color: #666666;">You can find the updated Terms of Service on our website.</p>
                          <p style="font-size: 16px; color: #666666;">If you have any questions or concerns, please don't hesitate to reach out to our support team.</p>
                          <p style="font-size: 16px; color: #666666;">Thank you for being a valued member of our community.</p>
                          <p style="font-size: 16px; color: #666666;">Best regards,<br>The Unrono Team</p>
                        </div>
                      </body>
                    `
                  }]
                })
              });
            }
      
            return SEND({ message: 'Terms of service update email sent to all sellers' }, 200);
          } catch (err) {
            return SEND({ error: 'Failed to send terms of service update email', details: err.message }, 500);
          }
        }
        break;

      case '/my-data':
        if (request.method === 'GET') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 401);
            }
            
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 401);
            }
            
            // Retrieve the user's data from the "users" table, excluding sensitive columns
            const user = await env.DB.prepare('SELECT username, email, listed_product_ids, login_timestamps, thumbnails_zip_ids, has_profile_picture, id, reset_token, country, zip_code FROM users WHERE username = ?').bind(username).first();
            
            if (!user) {
              return SEND({ error: 'User not found' }, 404);
            }

            if (user.email != null && user.email.includes('@@')) {
              user.email = user.email.split('@@');
              user.email = user.email[0] + '@@' + user.email[1];
            }
            
            // Return the user's data
            return SEND(user, 200);
          } catch (err) {
            console.log(err.message);
            console.log(err.stack);
            return SEND({ error: 'Failed to retrieve user data', details: err.message }, 500);
          }
        }
        break;

      case '/rate-product':
        if (request.method === 'GET') {
          try {
            const url = new URL(request.url);
            const email = url.searchParams.get('email');
            const productId = url.searchParams.get('productId');
            const rating = parseInt(url.searchParams.get('rating'));
      
            if (!email || !productId || isNaN(rating) || rating < 1 || rating > 5) {
              return SEND({ error: 'Invalid parameters' }, 400);
            }
      
            // Retrieve the product from the database
            const product = await env.DB.prepare('SELECT sales_private_data, ratings FROM products WHERE id = ?').bind(productId).first();
            if (!product) {
              return SEND({ error: 'Product not found' }, 404);
            }
      
            const privateData = JSON.parse(product.sales_private_data);
            const ratings = JSON.parse(product.ratings);
      
            const emailIndex = privateData[0].indexOf(email);
            if (emailIndex == -1) {
              return SEND({ error: 'Email not found in product sales' }, 404);
            }
      
            const oldRating = privateData[2][emailIndex];
            privateData[2][emailIndex] = rating;
      
            // Update ratings array
            if (oldRating > 0) {
              ratings[oldRating - 1]--;
            }
            ratings[rating - 1]++;
      
            // Update the product in the database
            await env.DB.prepare('UPDATE products SET sales_private_data = ?, ratings = ? WHERE id = ?')
              .bind(JSON.stringify(privateData), JSON.stringify(ratings), productId)
              .run();
      
            // Redirect to a thank you page
            return Response.redirect(`https://${PAGES_DOMAIN}/product?id=${productId}`, 302);
          } catch (err) {
            return SEND({ error: 'Failed to process rating', details: err.message }, 500);
          }
        }
        break;

      case '/delist-product':
        if (request.method === 'POST') {
          try {
            const token = request.headers.get('Authorization');
            if (!token) {
              return SEND({ error: 'Missing token in authorization header' }, 401);
            }
            const username = await verifyToken(token, env.SECRET_KEY);
            if (!username) {
              return SEND({ error: 'Invalid or expired token' }, 401);
            }
      
            const { productId } = await request.json();
      
            // Check if the product exists and belongs to the user
            const product = await env.DB.prepare('SELECT creator_id FROM products WHERE id = ?').bind(productId).first();
            if (!product) {
              return SEND({ error: 'Product not found' }, 404);
            }
      
            const user = await env.DB.prepare('SELECT id, listed_product_ids FROM users WHERE username = ?').bind(username).first();
            if (product.creator_id != user.id) {
              return SEND({ error: 'Product does not belong to user' }, 403);
            }
      
            // Update the product's visibility in the database (set to delisted)
            await env.DB.prepare('UPDATE products SET visible = 0 WHERE id = ?').bind(productId).run();
      
            return SEND({ message: 'Product deleted successfully' }, 200);
          } catch (err) {
            console.log(err.message);
            console.log(err.stack);
            return SEND({ error: 'Failed to delete product', details: err.message }, 500);
          }
        }
        break;

      default:
        return SEND({ error: 'Not found' }, 404);
    }
  }
};