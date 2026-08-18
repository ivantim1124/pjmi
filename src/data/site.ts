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

export type Project = {
  slug: string;
  title: string;
  summary: string;
  status: string;
  stack: string[];
  accent: 'cyan' | 'lime' | 'coral' | 'blue';
};

export type Activity = {
  date: string;
  type: string;
  title: string;
  summary: string;
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

export const projects: Project[] = [
  {
    slug: 'project-01',
    title: '專案名稱待補',
    summary: '放上專案想解決的問題、做法，以及最後留下來的成果。',
    status: '資料待補',
    stack: ['技術待補', '連結待補'],
    accent: 'cyan',
  },
  {
    slug: 'project-02',
    title: '作品資料待補',
    summary: '可以是機器人、軟體、感測器、競賽作品或一個還在實驗的點子。',
    status: '資料待補',
    stack: ['技術待補', '圖片待補'],
    accent: 'lime',
  },
  {
    slug: 'project-03',
    title: '下一個想法',
    summary: '好的專案不一定從完整答案開始，先把問題寫下來，就能開始一起做。',
    status: '準備中',
    stack: ['想法', '協作'],
    accent: 'coral',
  },
];

export const activities: Activity[] = [
  {
    date: '2025',
    type: '競賽',
    title: 'Tech Empower Innovation 科技賦能創新比賽',
    summary: 'PJMI 參與過的競賽紀錄。',
  },
  {
    date: '2026',
    type: '競賽',
    title: '工業機器人競賽',
    summary: 'PJMI 參與過的競賽紀錄。',
  },
  {
    date: '2026',
    type: '競賽',
    title: 'START!AI 智慧小車全國競賽',
    summary: 'PJMI 參與過的競賽紀錄。',
  },
  {
    date: '2026',
    type: '展覽',
    title: '桃園市中小學科學展覽',
    summary: 'PJMI 參與過的活動紀錄。',
  },
  {
    date: '2026',
    type: '競賽',
    title: '全國高中生活科技學藝競賽',
    summary: 'PJMI 參與過的競賽紀錄。',
  },
  {
    date: '2026',
    type: '獎項',
    title: '旺宏科學獎',
    summary: 'PJMI 參與過的活動紀錄。',
  },
];
