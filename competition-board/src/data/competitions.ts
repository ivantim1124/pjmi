export type CompetitionStatus = 'upcoming' | 'completed' | 'archived';

export type Competition = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  location: string;
  status: CompetitionStatus;
  link: string;
  featured: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const previewCompetitions: Competition[] = [];
