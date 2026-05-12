// Per-gallery cap for property photos. Lives in its own module so the
// "use server" actions file (which can only export async functions in
// Next 15) doesn't have to host non-async exports the page needs.

export const PROPERTY_GALLERY_MAX = 20;
