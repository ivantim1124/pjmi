export const siteConfig = {
  name: 'PJMI',
  displayName: '鎮高機研',
  description: '把好奇心接上電，和一群人一起把想法做成可以運作的東西。',
  recruitmentUrl:
    'https://script.google.com/macros/s/AKfycbwi2G1wPeCNcKmupVEWUI9cmxC3sBgdoqi2wd_JlVYJg8eWBWoeHcRPQSRWhPfagt84/exec',
  githubUrl: 'https://github.com/ivantim1124/pjmi',
  competitionBoardUrl: 'https://competitions.pjmi.dpdns.org/',
};

export type Member = {
  slug: string;
  name: string;
  role: string;
  grade: string;
  bio: string;
  tags: string[];
  accent: 'cyan' | 'lime' | 'coral' | 'blue';
};

export type Activity = {
  date: string;
  type: string;
  title: string;
};

export const members: Member[] = [
  {
    slug: 'member-01',
    name: '蘇琦軒',
    role: '社長',
    grade: '幹部',
    bio: '幹部資料待補，之後可補上個人介紹與技術興趣。',
    tags: ['幹部', 'PJMI'],
    accent: 'cyan',
  },
  {
    slug: 'member-02',
    name: '吳雨庭',
    role: '副社',
    grade: '幹部',
    bio: '幹部資料待補，之後可補上個人介紹與技術興趣。',
    tags: ['幹部', 'PJMI'],
    accent: 'lime',
  },
  {
    slug: 'member-03',
    name: '杜廣謙',
    role: '活動',
    grade: '幹部',
    bio: '幹部資料待補，之後可補上個人介紹與技術興趣。',
    tags: ['幹部', '活動'],
    accent: 'coral',
  },
  {
    slug: 'member-04',
    name: '社員資料待補',
    role: '社員',
    grade: '年級待補',
    bio: '社員頁會保留簡潔的資料結構，讓未來新增或更新成員時不需要改版面。',
    tags: ['資料待補', '協作'],
    accent: 'blue',
  },
];

export const activities: Activity[] = [
  {
    date: '2025',
    type: '競賽',
    title: 'Tech Empower Innovation 科技賦能創新比賽',
  },
  {
    date: '2026',
    type: '競賽',
    title: '工業機器人競賽',
  },
  {
    date: '2026',
    type: '競賽',
    title: 'START!AI 智慧小車全國競賽',
  },
  {
    date: '2026',
    type: '展覽',
    title: '桃園市中小學科學展覽',
  },
  {
    date: '2026',
    type: '競賽',
    title: '全國高中生活科技學藝競賽',
  },
  {
    date: '2026',
    type: '獎項',
    title: '旺宏科學獎',
  },
];
