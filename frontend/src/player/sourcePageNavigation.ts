export function sourcePageNavigation(pages: number[], automatic: number | undefined, manual?: number) {
  const unique = [...new Set(pages)]
  const page = manual !== undefined && unique.includes(manual) ? manual
    : automatic !== undefined && unique.includes(automatic) ? automatic : unique[0]
  const index = unique.indexOf(page)
  return { page, index, count: unique.length, previous: unique[index-1], next: unique[index+1] }
}
