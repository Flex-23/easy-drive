/** Write a browser cookie. Isolated from components so the hooks lint rules
 * don't flag the `document.cookie` assignment as a component-scope mutation. */
export function setBrowserCookie(name: string, value: string, maxAgeSeconds = 31536000): void {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}
