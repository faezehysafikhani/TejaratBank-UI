import { apiRequest } from './nexusApi';

export interface MeetingAgenda { title: string; durationMinutes: number; presenterUserId: string | null }
export interface MeetingAction { title: string; assigneeUserId: string | null; dueDate: string | null; status: 'todo' | 'in_progress' | 'completed' }
export interface MeetingInput {
  title: string; type: 'meeting' | 'online' | 'committee'; date: string;
  startTime: string; endTime: string; location: string; organizerUserId: string; description: string;
  participantIds: string[]; agenda: MeetingAgenda[]; minutes: string; actions: MeetingAction[];
  taskIds: string[]; sendInvitationSms: boolean; version?: number;
}
export interface Meeting {
  id: string; createdByUserId: string; version: number; details: MeetingInput;
  canEdit: boolean; canDelete: boolean; notice?: string | null;
}
const base = '/api/calendar/meetings';
export const listMeetings = (from: string, to: string) => apiRequest<Meeting[]>('GET', base, { query: { from, to } });
export const saveMeeting = (input: MeetingInput, id?: string) => apiRequest<Meeting>(id ? 'PUT' : 'POST', id ? `${base}/${id}` : base, { body: input });
export const deleteMeeting = (meeting: Meeting) => apiRequest<void>('DELETE', `${base}/${meeting.id}`, { query: { version: meeting.version } });
export interface MeetingTaskOption { id: string; title: string; status: string; dueDate: string; isProject: boolean }
export interface MeetingTaskPage { items: MeetingTaskOption[]; totalCount: number; pageNumber: number; pageSize: number }
export const searchMeetingTasks = (search: string, pageNumber = 1) => apiRequest<MeetingTaskPage>('GET', `${base}/task-options`, { query: { search, pageNumber, pageSize: 12 } });
export const getMeetingTaskOptions = (ids: string[]) => apiRequest<MeetingTaskPage>('GET', `${base}/task-options`, { query: { ids: ids.join(',') } });
export interface MeetingPerson { id: string; name: string; positionTitle: string; relation: 'self' | 'superior' | 'subordinate' | 'peer' | 'all' }
export interface MeetingPeopleOptions { canCreate: boolean; canInviteHigher: boolean; people: MeetingPerson[]; message?: string | null }
export const getMeetingPeople = () => apiRequest<MeetingPeopleOptions>('GET', `${base}/people-options`);
