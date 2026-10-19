import type { Slot } from './api';

export function slotAssignments(
  slots: Slot[],
  slotNumber: number,
  memberId: string | null,
) {
  return slots.map((slot) => ({
    slotNumber: slot.slotNumber,
    organizationMemberId:
      slot.slotNumber === slotNumber ? memberId : slot.organizationMemberId,
  }));
}
