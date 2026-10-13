export interface ChatLeaveRequest {
  userId: string;
  policyId: string;
  leaveName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface ChatLeaveContext {
  requests: ChatLeaveRequest[];
  pendingCount: number;
}
