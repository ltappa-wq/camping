// Per-gallery cap for site photos. Lives in its own module so the
// "use server" actions file (which can only export async functions in
// Next 15) doesn't have to host non-async exports the page needs.

export const SITE_GALLERY_MAX = 5;
