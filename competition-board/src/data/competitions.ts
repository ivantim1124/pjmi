export type CompetitionStatus = 'upcoming' | 'completed' | 'archived';

export type Competition = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  location: string;
  status: CompetitionStatus;
  description: string;
  link: string;
  featured: boolean;
  createdAt?: string;
  updatedAt?: string;
};

// 這些資料只作為 API 尚未連線時的預覽；正式資料會從 Cloudflare D1 載入。
export const previewCompetitions: Competition[] = [
  {
    id: 'preview-01',
    title: '2026 工業機器人競賽',
    category: '競賽',
    eventDate: '2026',
    location: '地點待補',
    status: 'completed',
    description: 'PJMI 參與過的競賽紀錄。',
    link: '',
    featured: true,
  },
  {
    id: 'preview-02',
    title: '2026 START!AI 智慧小車全國競賽',
    category: '競賽',
    eventDate: '2026',
    location: '地點待補',
    status: 'completed',
    description: 'PJMI 參與過的競賽紀錄。',
    link: '',
    featured: false,
  },
  {
    id: 'preview-03',
    title: '2026 桃園市中小學科學展覽',
    category: '展覽',
    eventDate: '2026',
    location: '地點待補',
    status: 'completed',
    description: 'PJMI 參與過的活動紀錄。',
    link: '',
    featured: false,
  },
];
