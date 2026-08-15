export const siteConfig = {
  name: 'pjmi',
  displayName: '鎮高機研',
  description: '把好奇心接上電，和一群人一起把想法做成可以運作的東西。',
  recruitmentUrl:
    'https://script.google.com/macros/s/AKfycbwi2G1wPeCNcKmupVEWUI9cmxC3sBgdoqi2wd_JlVYJg8eWBWoeHcRPQSRWhPfagt84/exec',
  githubUrl: 'https://github.com/ivantim1124/pjmi',
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
    name: '社員資料待補',
    role: '職務待補',
    grade: '年級待補',
    bio: '這裡會放社員的簡短介紹、正在研究的題目，以及想和大家一起完成的事。',
    tags: ['資料待補', 'PJMI'],
    accent: 'cyan',
  },
  {
    slug: 'member-02',
    name: '社員資料待補',
    role: '職務待補',
    grade: '年級待補',
    bio: '一張卡片就是一個正在成形的方向，等你提供真實名單後即可直接替換。',
    tags: ['資料待補', '製作中'],
    accent: 'lime',
  },
  {
    slug: 'member-03',
    name: '社員資料待補',
    role: '職務待補',
    grade: '年級待補',
    bio: '可以放上社員擅長的工具、參與過的專案或最想學會的技術。',
    tags: ['資料待補', '學習中'],
    accent: 'coral',
  },
  {
    slug: 'member-04',
    name: '社員資料待補',
    role: '職務待補',
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
    date: '日期待補',
    type: '社課',
    title: '活動資料待補',
    summary: '放上活動內容、參加方式與照片，讓新生知道加入後會一起經歷什麼。',
  },
  {
    date: '日期待補',
    type: '工作坊',
    title: '從零開始的實作時間',
    summary: '可以補充本次工作坊的主題、使用工具，以及社員帶走的成果。',
  },
  {
    date: '日期待補',
    type: '競賽',
    title: '成果與紀錄待補',
    summary: '有參賽、展覽或校內分享時，把過程與結果整理成下一次的起點。',
  },
];
