import { wordpressFetch } from './wp-env.mjs';

const me = await wordpressFetch('/wp-json/wp/v2/users/me?context=edit');

console.log(`Connected to WordPress as ${me.name || me.slug || me.username}`);
console.log(`User ID: ${me.id}`);
console.log(`REST base: ${me._links?.self?.[0]?.href || 'available'}`);
