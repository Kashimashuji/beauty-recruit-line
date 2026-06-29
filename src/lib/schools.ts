export const BEAUTY_SCHOOLS = [
  "山野美容専門学校",
  "山野ビューティアート専門学校",
  "東京ベルエポック美容専門学校",
  "東京モード学園",
  "専門学校 東京ビューティーアート",
  "日本美容専門学校",
  "日本ビジネス＆デザイン専門学校",
  "東京美容専門学校",
  "関東美容専門学校",
  "新宿ビューティーアート専門学校",
  "大宮ビューティーアート専門学校",
  "横浜ビューティーアート専門学校",
  "大阪ベルエポック美容専門学校",
  "大阪モード学園",
  "大阪美容専門学校",
  "大阪ビューティーアート専門学校",
  "神戸ベルエポック美容専門学校",
  "名古屋ベルエポック美容専門学校",
  "名古屋モード学園",
  "名古屋美容専門学校",
  "福岡ベルエポック美容専門学校",
  "福岡美容専門学校",
  "仙台ビューティーアート専門学校",
  "札幌ビューティーアート専門学校",
  "辻学園美容専門学校",
  "バンタンデザイン研究所",
  "HAB大阪ビジネス外語専門学校",
  "コーセー美容専門学校",
];

export function searchSchools(query: string): string[] {
  if (!query || query.length < 1) return [];
  return BEAUTY_SCHOOLS.filter(s => s.includes(query)).slice(0, 6);
}

export function isExactSchool(name: string): boolean {
  return BEAUTY_SCHOOLS.includes(name);
}
