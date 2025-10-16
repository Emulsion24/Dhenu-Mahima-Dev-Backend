export const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

export const generateUniqueSlug = async (prisma, title, newsId = null) => {
  let slug = slugify(title);
  let count = 0;
  let uniqueSlug = slug;

  while (true) {
    const existing = await prisma.news.findUnique({
      where: { slug: uniqueSlug }
    });

    if (!existing || (newsId && existing.id === newsId)) {
      break;
    }

    count++;
    uniqueSlug = `${slug}-${count}`;
  }

  return uniqueSlug;
};
