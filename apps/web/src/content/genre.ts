// A book's genre is the first thing in its `categories`; anything after it is
// a set the book was bundled into — a prize list, a publisher's canon, a
// series. The library repository sorts on genre for exactly that reason
// (superb-catalogue/library's CATEGORIES.md): someone browsing thinks "a
// mystery" long before they think "a Haycraft-Queen cornerstone".
//
// Everything that colours a book — the plates, the spine bands, the fact row
// on a book page — asks this, so there is one answer rather than five.
export function genreOf(book: { categories?: string[] }): string | undefined {
  return book.categories?.[0];
}
