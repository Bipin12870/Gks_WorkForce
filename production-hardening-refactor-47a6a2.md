# Production Hardening & Trust Architecture Refactor Plan

This plan transforms the workforce management PWA from "client defines truth" to "server enforces truth" while preserving all existing operational behavior, workflows, and business logic.

## PART 1: CURRENT ARCHITECTURE AUDIT

### Critical Trust Boundary Violations Identified

#### 1. Firestore Security Rules - COMPLETELY OPEN
**File:** `firestore.rules`
- ALL collections have `allow read, write: if true;`
- No authentication enforcement
- No role separation
- No ownership validation
- Comments explicitly state "GLOBAL DEV MODE" and "No Firebase Auth implemented yet"
- Database is NOT a trusted authority

**Impact:** Any authenticated user can read/write ANY collection. Staff can directly modify payroll data, hourly rates, admin records, and audit logs.

#### 2. Client-Authoritative Business Logic

**Clock-in/Clock-out** (`app/staff/clock/page.tsx`):
- GPS validation is client-side
- Time rounding is client-side
- Timesheet generation is client-side
- Payroll calculation (`processTimesheetAutomation`) is client-side
- Approval status determination is client-side
- Direct Firestore writes: `addDoc(collection(db, 'timeRecords'))`, `updateDoc()`, `addDoc(collection(db, 'timesheets'))`

**Timesheet Approval** (`app/admin/timesheets/page.tsx`):
- Approval logic is client-side
- Worked hour adjustments are client-side
- Direct Firestore write: `updateDoc(doc(db, 'timesheets', timesheetId), updates)`
- No server validation of payroll calculations

**Roster Management** (`app/admin/roster/page.tsx`):
- Shift creation/edit is client-side
- Overlap validation is client-side
- Direct Firestore writes: `addDoc(collection(db, 'shifts'))`, `updateDoc()`, `deleteDoc()`
- Audit logging is client-side (bypassable)

**Staff Management** (`app/admin/staff/page.tsx`):
- Hourly rate changes are client-side
- Staff creation/deletion is client-side
- Direct Firestore writes: `updateDoc()`, `setDoc()`, `deleteDoc()`
- No server validation of rate changes

**Availability Submission** (`components/StaffAvailabilitySection.tsx`):
- Direct Firestore writes: `setDoc()`, `deleteDoc()`
- No server validation

#### 3. Role Authorization - Client-Side Only

**Pattern throughout codebase:**
```typescript
if (!userData || userData.role !== 'ADMIN') return;
```

**Issues:**
- Role checks are UI-level only
- Client can manipulate `userData.role` in React state
- No server-side validation of role assertions
- Firestore rules don't enforce role separation

#### 4. Mutable Historical Records

**Approved Timesheets:**
- Can be modified after approval via `handleUpdateStatus()`
- No immutability protection
- No version history
- Direct overwrites of `workedStart`, `workedEnd`, `status`

**Audit Logs:**
- Stored in `rosterAuditLogs` collection with `allow read, write: if true;`
- Can be deleted or modified
- Not append-only
- Only covers roster edits, not timesheet changes or rate changes

**Hourly Rates:**
- Can be changed without historical tracking
- No audit trail for payroll-affecting changes

#### 5. Missing Auditability

**No audit logging for:**
- Timesheet approvals
- Timesheet adjustments
- Hourly rate changes
- Manual timesheet submissions
- Clock-in/clock-out operations
- Status transitions

**Existing audit logging:**
- Only for roster EDIT/REMOVE operations
- Client-side implementation (bypassable)
- Collection is unprotected

#### 6. Direct Database Write Vulnerabilities

**All critical operations bypass server:**
- Clock-in/clock-out → direct Firestore write
- Timesheet submission → direct Firestore write
- Timesheet approval → direct Firestore write
- Shift creation/edit → direct Firestore write
- Staff rate changes → direct Firestore write
- Availability submission → direct Firestore write

**No server-side API layer for:**
- Payroll calculations
- Approval decisions
- Protected state transitions
- Financial calculations

#### 7. Payroll Calculation Fragmentation

**Current state:**
- `processTimesheetAutomation()` in `lib/utils.ts` is client-side
- Called from clock-out logic (client)
- Called from admin approval (client)
- No server-side validation of results
- Client determines payable hours, overtime, approval status

**Risk:** Staff can manipulate client to produce favorable payroll calculations.

#### 8. Operational Corruption Risks

**No server-side validation for:**
- Invalid time ranges (end <= start)
- Overlapping approved timesheets
- Negative durations
- Invalid status transitions
- Inconsistent rounding
- Malformed worked durations
- Orphaned timesheets
- Contradictory states

**Validation exists but is client-side only.**

---

## PART 2: HARDENED ARCHITECTURE DESIGN

### Trusted Authority Layer Architecture

**Pattern:** Frontend → Next.js Server Action → Firestore (with hardened rules)

**Server Actions Structure:**
```
app/actions/
├── auth/              # Authentication & session management
├── timesheets/        # Timesheet operations (server-authoritative)
├── shifts/            # Shift/roster operations
├── staff/             # Staff management operations
├── availability/      # Availability operations
├── clock/             # Clock-in/clock-out operations
├── audit/             # Audit logging (server-side)
└── payroll/           # Payroll calculations (server-authoritative)
```

### Firestore Security Rules Design

**Principles:**
1. Authentication required for all operations
2. Role-based access control (ADMIN vs STAFF)
3. Ownership validation (staff can only access their own data)
4. Collection-specific protection
5. Append-only behavior for audit logs
6. Immutability for approved records

**Rule Structure:**
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'ADMIN';
    }
    
    function isStaff() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'STAFF';
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // USERS COLLECTION
    match /users/{userId} {
      allow read: if isAdmin() || isOwner(userId);
      allow create: if isAdmin(); // Only admin can create users
      allow update: if isAdmin() || isOwner(userId); // Staff can update own profile only
      allow delete: if isAdmin(); // Only admin can delete
    }
    
    // TIMESHEETS COLLECTION
    match /timesheets/{timesheetId} {
      allow read: if isAdmin() || (isStaff() && resource.data.staffId == request.auth.uid);
      allow create: if isStaff() && request.resource.data.staffId == request.auth.uid;
      allow update: if isAdmin() || 
                       (isStaff() && resource.data.staffId == request.auth.uid && resource.data.status == 'PENDING');
      // Staff can only update their own PENDING timesheets
      // Admin can update any timesheet
      allow delete: if isAdmin(); // Only admin can delete
    }
    
    // SHIFTS COLLECTION
    match /shifts/{shiftId} {
      allow read: if isAdmin() || (isStaff() && resource.data.staffId == request.auth.uid);
      allow create: if isAdmin(); // Only admin can create shifts
      allow update: if isAdmin(); // Only admin can update shifts
      allow delete: if isAdmin(); // Only admin can delete shifts
    }
    
    // TIME RECORDS COLLECTION
    match /timeRecords/{recordId} {
      allow read: if isAdmin() || (isStaff() && resource.data.staffId == request.auth.uid);
      allow create: if isStaff() && request.resource.data.staffId == request.auth.uid;
      allow update: if isAdmin() || 
                       (isStaff() && resource.data.staffId == request.auth.uid && resource.data.clockOutTime == null);
      // Staff can only update their own active (unclocked) records
      allow delete: if isAdmin(); // Only admin can delete
    }
    
    // AVAILABILITY COLLECTION
    match /availability/{availabilityId} {
      allow read: if isAdmin() || (isStaff() && resource.data.staffId == request.auth.uid);
      allow create: if isStaff() && request.resource.data.staffId == request.auth.uid;
      allow update: if isStaff() && resource.data.staffId == request.auth.uid;
      allow delete: if isStaff() && resource.data.staffId == request.auth.uid;
    }
    
    // AUDIT LOGS COLLECTION (APPEND-ONLY)
    match /auditLogs/{logId} {
      allow read: if isAdmin(); // Only admin can read audit logs
      allow create: if isAdmin(); // Only server actions (admin context) can create
      allow update: if false; // Never allow updates
      allow delete: if false; // Never allow deletes
    }
    
    // CONFIG COLLECTION
    match /config/{docId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin(); // Only admin can modify config
    }
  }
}
```

### Server-Authoritative Payroll Engine

**Location:** `lib/payroll-engine.ts` (server-only utility)

**Responsibilities:**
- All payroll calculations
- Approval status determination
- Overtime/flag calculation
- Rounding enforcement
- Validation of time ranges
- Deterministic output

**Signature:**
```typescript
// server-only
export function calculatePayrollServer(input: PayrollInput): PayrollResult {
  // All logic from processTimesheetAutomation, but server-authoritative
  // Returns validated, trustworthy payroll data
}
```

**Usage:**
- Called from server actions for clock-out
- Called from server actions for timesheet approval
- Called from server actions for manual timesheet submission
- Frontend can call for previews (non-authoritative)

### Immutable Record Strategy

**Approved Timesheets:**
- Once `status: 'APPROVED'`, cannot be modified directly
- Corrections create linked `timesheetCorrections` records
- Original approved record remains immutable
- Payroll calculations reference original + corrections

**Schema Addition:**
```typescript
interface TimesheetCorrection {
  id?: string;
  originalTimesheetId: string;
  correctedBy: string; // admin uid
  previousWorkedStart: string;
  previousWorkedEnd: string;
  newWorkedStart: string;
  newWorkedEnd: string;
  reason: string;
  createdAt: Timestamp;
}
```

**Correction Workflow:**
1. Admin requests correction via server action
2. Server action creates correction record
3. Server action recalculates payroll with correction applied
4. Original timesheet remains unchanged
5. Audit log records correction

### Append-Only Audit Logging

**Collection:** `auditLogs`

**Schema:**
```typescript
interface AuditLog {
  id?: string;
  actorId: string; // uid
  actorRole: 'ADMIN' | 'STAFF';
  action: string; // e.g., 'TIMESHEET_APPROVE', 'RATE_CHANGE', 'SHIFT_EDIT'
  targetCollection: string; // e.g., 'timesheets', 'users'
  targetDocumentId: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  timestamp: Timestamp;
}
```

**Server-Side Logging:**
```typescript
// lib/audit-logger.ts (server-only)
export async function logAuditEvent(params: AuditParams) {
  const adminDb = getAdminDb();
  await addDoc(collection(adminDb, 'auditLogs'), {
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    targetCollection: params.targetCollection,
    targetDocumentId: params.targetDocumentId,
    previousValues: params.previousValues,
    newValues: params.newValues,
    reason: params.reason,
    timestamp: Timestamp.now(),
  });
}
```

**Logged Events:**
- Timesheet approvals
- Timesheet adjustments
- Timesheet corrections
- Hourly rate changes
- Shift creation/edit/delete
- Staff creation/deletion
- Manual timesheet submissions
- Status transitions
- Config changes

### Gradual Migration Strategy

**Phase 1: Foundation (No Breaking Changes)**
1. Add server action infrastructure
2. Add audit logging infrastructure
3. Add payroll engine as server utility
4. Keep existing client-side logic intact
5. Add compatibility layer for dual operation

**Phase 2: Server Actions for Critical Paths**
1. Implement server actions for timesheet operations
2. Implement server actions for clock-in/clock-out
3. Implement server actions for shift operations
4. Update frontend to call server actions instead of direct Firestore
5. Keep client-side calculations for UI previews
6. Server validates all operations

**Phase 3: Firestore Rules Hardening**
1. Deploy new Firestore security rules
2. Test with server actions (should work)
3. Direct client writes will now be blocked
4. Ensure all operations go through server actions

**Phase 4: Immutability & Audit**
1. Implement timesheet correction workflow
2. Add audit logging to all server actions
3. Make approved timesheets immutable
4. Add audit viewer for admin

**Phase 5: Cleanup**
1. Remove client-side direct Firestore writes
2. Remove client-side authoritative calculations
3. Remove compatibility layer
4. Final testing

**Compatibility During Migration:**
- Server actions validate and enforce rules
- Client-side logic remains for UI responsiveness
- Gradual rollout per feature area
- No downtime required

---

## PART 3: IMPLEMENTATION PLAN

### Phase 1: Foundation Infrastructure

**1.1 Create Server Action Structure**
- Create `app/actions/` directory structure
- Create base server action utilities
- Add server-only imports where needed
- Add error handling patterns

**1.2 Create Audit Logging Infrastructure**
- Create `lib/audit-logger.ts` (server-only)
- Define `AuditLog` type in `types/index.ts`
- Implement `logAuditEvent()` function
- Add `auditLogs` collection to types

**1.3 Create Server-Authoritative Payroll Engine**
- Create `lib/payroll-engine.ts` (server-only)
- Move `processTimesheetAutomation()` logic to server
- Add server-only validation
- Preserve exact same calculation logic (behavior preservation)
- Add TypeScript exports for type safety

**1.4 Add Server Action Utilities**
- Create `app/actions/shared/` for shared utilities
- Add user validation helpers
- Add role validation helpers
- Add error response helpers

### Phase 2: Critical Server Actions

**2.1 Timesheet Server Actions**
- `app/actions/timesheets/create.ts` - Create timesheet (staff)
- `app/actions/timesheets/update-status.ts` - Approve/reject (admin)
- `app/actions/timesheets/adjust.ts` - Adjust worked hours (admin)
- `app/actions/timesheets/correct.ts` - Create correction (admin)
- All actions call server payroll engine
- All actions log audit events
- All actions validate business rules

**2.2 Clock Server Actions**
- `app/actions/clock/clock-in.ts` - Clock in (staff)
- `app/actions/clock/clock-out.ts` - Clock out (staff)
- Server validates GPS coordinates
- Server calls payroll engine for timesheet generation
- Server logs audit events
- Preserve existing cooling periods and restrictions

**2.3 Shift Server Actions**
- `app/actions/shifts/create.ts` - Create shift (admin)
- `app/actions/shifts/update.ts` - Update shift (admin)
- `app/actions/shifts/delete.ts` - Delete shift (admin)
- Server validates overlap rules
- Server validates availability rules
- Server logs audit events
- Preserve existing roster audit log (add to new system)

**2.4 Staff Server Actions**
- `app/actions/staff/create.ts` - Create staff (admin)
- `app/actions/staff/update-rate.ts` - Update hourly rate (admin)
- `app/actions/staff/update-status.ts` - Activate/deactivate (admin)
- `app/actions/staff/delete.ts` - Delete staff (admin)
- Server validates rate changes
- Server logs audit events for rate changes

**2.5 Availability Server Actions**
- `app/actions/availability/submit.ts` - Submit availability (staff)
- `app/actions/availability/delete.ts` - Delete availability (staff)
- Server validates time ranges
- Server logs audit events

### Phase 3: Frontend Integration

**3.1 Update Clock Page**
- Replace direct Firestore writes with server actions
- Keep all existing UI logic (warnings, confirmations, cooling periods)
- Keep GPS validation on client (for UX) + server validation (for trust)
- Preserve exact same user experience

**3.2 Update Staff Timesheet Page**
- Replace direct Firestore writes with server actions
- Keep manual submission workflow
- Keep validation UI
- Preserve exact same user experience

**3.3 Update Admin Timesheet Page**
- Replace direct Firestore writes with server actions
- Keep approval workflow
- Keep adjustment modal
- Add correction workflow for approved timesheets
- Preserve exact same admin experience

**3.4 Update Admin Roster Page**
- Replace direct Firestore writes with server actions
- Keep shift creation/edit workflow
- Keep availability approval workflow
- Preserve exact same admin experience

**3.5 Update Admin Staff Page**
- Replace direct Firestore writes with server actions
- Keep staff creation workflow
- Keep rate adjustment workflow
- Preserve exact same admin experience

**3.6 Update Availability Components**
- Replace direct Firestore writes with server actions
- Keep submission workflow
- Preserve exact same staff experience

### Phase 4: Firestore Rules Deployment

**4.1 Implement Hardened Rules**
- Replace `firestore.rules` with new rules
- Add authentication checks
- Add role-based access
- Add ownership validation
- Add collection-specific protection
- Make audit logs append-only

**4.2 Test Rules with Server Actions**
- Verify all server actions work with new rules
- Verify staff cannot access admin data
- Verify staff cannot modify other staff data
- Verify direct client writes are blocked

**4.3 Rollback Plan**
- Keep old rules as backup
- If issues arise, revert immediately
- Fix issues, then redeploy

### Phase 5: Immutability & Audit Enhancement

**5.1 Implement Timesheet Corrections**
- Add `timesheetCorrections` collection to types
- Implement correction server action
- Update admin timesheet page to use corrections for approved timesheets
- Preserve original approved timesheet

**5.2 Add Audit Log Viewer**
- Create admin page to view audit logs
- Filter by action, actor, date range
- Show previous vs new values
- Preserve admin visibility

**5.3 Add Audit Logging to All Actions**
- Ensure every server action logs audit events
- Log previous values for updates
- Log reason/context where applicable
- Ensure audit logs are append-only

### Phase 6: Cleanup & Validation

**6.1 Remove Client-Side Direct Writes**
- Remove remaining direct Firestore calls from frontend
- Remove client-side authoritative calculations
- Keep client-side calculations for UI previews only

**6.2 Remove Compatibility Layer**
- Remove any temporary compatibility code
- Ensure all operations go through server actions

**6.3 Comprehensive Testing**
- Test all user workflows end-to-end
- Test all admin workflows end-to-end
- Verify payroll calculations match original
- Verify audit logs are complete
- Verify immutability is enforced

**6.4 Performance Validation**
- Ensure server actions are responsive
- Ensure no significant UX degradation
- Optimize if needed

---

## PART 4: BEHAVIOR PRESERVATION GUARANTEES

### Preserved Operational Behaviors

**Clock-in/Clock-out:**
- Same GPS geofence restrictions
- Same cooling periods (60s clock-out, 5min clock-in)
- Same time rounding (nearest 5 minutes)
- Same auto-close logic
- Same warning/confirmation dialogs
- Same shift matching logic
- Same overtime detection
- Same after-hours detection

**Timesheet Submission:**
- Same manual submission workflow
- Same validation rules (shop hours, duration)
- Same future shift restrictions
- Same active clock session restrictions
- Same significant overtime detection

**Timesheet Approval:**
- Same approval workflow
- Same adjustment capabilities
- Same overlap validation
- Same shop hours validation
- Same duration validation

**Roster Management:**
- Same shift creation workflow
- Same availability matching
- Same overlap validation
- Same availability validation
- Same edit/delete workflow

**Staff Management:**
- Same staff creation workflow
- Same rate adjustment workflow
- Same activation/deactivation workflow
- Same deletion workflow

**Payroll Calculations:**
- EXACT same calculation logic
- EXACT same rounding policy
- EXACT same overtime thresholds
- EXACT same flagging behavior
- EXACT same approval automation logic

**Hybrid Automation:**
- EXACT same auto-approval conditions
- EXACT same flagging conditions
- EXACT same needs-review conditions
- EXACT same rejection conditions

### What Changes (Trust Boundaries Only)

**BEFORE:**
- Client calculates payroll → Client writes to Firestore
- Client determines approval → Client writes to Firestore
- Client validates rules → Client writes to Firestore
- Firestore accepts any write from authenticated user

**AFTER:**
- Client suggests action → Server validates → Server calculates → Server writes to Firestore
- Client suggests approval → Server validates → Server determines → Server writes to Firestore
- Client suggests data → Server validates rules → Server writes to Firestore
- Firestore enforces authentication, role, ownership, collection rules

---

## PART 5: RISK MITIGATION

### Migration Risks

**Risk:** Server actions introduce latency
**Mitigation:** Keep client-side calculations for UI previews, server validates final values

**Risk:** Firestore rules break existing functionality
**Mitigation:** Test thoroughly in development, keep rollback plan, deploy incrementally

**Risk:** Audit logging overhead
**Mitigation:** Async logging, non-blocking, batch writes where possible

**Risk:** Immutability breaks admin workflow
**Mitigation:** Correction workflow preserves flexibility while maintaining traceability

### Operational Continuity

**No Downtime:**
- Server actions deployed alongside existing code
- Frontend updated incrementally
- Firestore rules deployed last
- Rollback plan ready

**Data Preservation:**
- No destructive migrations
- Existing records remain valid
- New schema additions only
- Compatibility layer during transition

**User Experience:**
- No workflow changes
- No UI changes (except audit viewer addition)
- Same restrictions and warnings
- Same error messages

---

## PART 6: SUCCESS CRITERIA

### Security Criteria
- [ ] Staff cannot modify other staff data
- [ ] Staff cannot approve timesheets
- [ ] Staff cannot change hourly rates
- [ ] Staff cannot access admin-only collections
- [ ] Direct Firestore writes are blocked by rules
- [ ] All payroll calculations are server-validated
- [ ] All approvals are server-validated
- [ ] All protected writes go through server actions

### Trust Criteria
- [ ] Approved timesheets are immutable
- [ ] Corrections create linked records
- [ ] Audit logs are append-only
- [ ] All sensitive changes are logged
- [ ] Audit logs cannot be deleted
- [ ] Historical records can be reconstructed
- [ ] Payroll totals are trustworthy

### Operational Criteria
- [ ] All existing workflows preserved
- [ ] Same user experience
- [ ] Same admin experience
- [ ] Same business logic
- [ ] Same calculations
- [ ] Same warnings/flags
- [ ] No performance degradation

### Audit Criteria
- [ ] Timesheet approvals logged
- [ ] Timesheet adjustments logged
- [ ] Rate changes logged
- [ ] Shift changes logged
- [ ] Staff changes logged
- [ ] Manual submissions logged
- [ ] Corrections logged
- [ ] Admin can view audit history

---

## PART 7: IMPLEMENTATION ORDER

**Priority 1 (Critical Trust Boundaries):**
1. Server action infrastructure
2. Audit logging infrastructure
3. Payroll engine (server)
4. Timesheet server actions
5. Clock server actions
6. Firestore rules deployment

**Priority 2 (Operational Integrity):**
7. Shift server actions
8. Staff server actions
9. Availability server actions
10. Frontend integration (timesheets, clock)

**Priority 3 (Immutability & Audit):**
11. Timesheet corrections
12. Frontend integration (roster, staff, availability)
13. Audit log viewer
14. Comprehensive audit logging

**Priority 4 (Cleanup):**
15. Remove client-side direct writes
16. Remove compatibility layer
17. Final testing
18. Performance validation

---

## SUMMARY

This refactoring transforms the system from "client defines truth" to "server enforces truth" while preserving ALL existing operational behavior. The key changes are:

1. **Trust boundaries move to server** - Server actions become authoritative
2. **Firestore rules enforce security** - Defense-in-depth with role/ownership validation
3. **Payroll calculations become server-authoritative** - Financial truth enforced server-side
4. **Approved records become immutable** - Corrections create linked records
5. **Audit logging becomes server-side and append-only** - Trustworthy operational history

The result is a production-grade, trustworthy workforce management system that behaves exactly like the current app operationally but is architecturally secure and reliable.
