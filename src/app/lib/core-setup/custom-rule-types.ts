// [ai-assistant] The building blocks a custom rule is made from (PRD: Custom rules): a record type, conditions on its fields, a schedule.
//
// 247HR defines every block here; nothing a person or the assistant types is ever run as code. Each field names the data category it
// belongs to, so a rule cannot test a field in a category the company hides from the AI Assistant (for example pay).
import type { PrismaClient } from '@prisma/client'
import type { DataCategory } from '@/app/lib/ai/categories'

export type Operator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' | 'older_than' | 'count_above'
export type FieldKind = 'text' | 'status' | 'number' | 'date' | 'count' | 'ref'

export interface FieldDef {
  label: string
  kind: FieldKind
  // null = organisation structure (no personal data); otherwise the AI-access category that must be visible for the field to be used
  category: DataCategory | null
  operators: Operator[]
  values?: string[]
}

export interface RuleRow {
  id: string
  // what the Action Center and the preview show for this record
  label: string
  // a short secondary identifier: staff number, department code, template name
  ref: string
  sub: string | null
  active: boolean
  v: Record<string, string | number | Date | null>
}

export interface RecordTypeDef {
  key: RecordTypeKey
  label: string
  plural: string
  fields: Record<string, FieldDef>
  // With no status condition, only active records are considered, so a rule never fires for people or units that are closed.
  activeOnly: boolean
  // `now` is passed in so a test (or a re-run) measures ages from the same moment the evaluator does.
  load: (db: PrismaClient, companyId: string, now: Date) => Promise<RuleRow[]>
}

export const RECORD_TYPE_KEYS = ['staff', 'department', 'designation', 'business_unit', 'leave_request', 'payroll_template'] as const
export type RecordTypeKey = (typeof RECORD_TYPE_KEYS)[number]

export const CADENCES = ['event', 'hourly', 'daily', 'weekly'] as const
export type Cadence = (typeof CADENCES)[number]
// How long after its last run a rule is due again. `event` rules are checked on every pass of the scheduler.
export const CADENCE_MIN_GAP_MS: Record<Cadence, number> = { event: 0, hourly: 55 * 60_000, daily: 23 * 3_600_000, weekly: 6.9 * 86_400_000 }

const TEXT: Operator[] = ['equals', 'not_equals', 'is_empty', 'is_not_empty']
const STATE: Operator[] = ['equals', 'not_equals']
const EMPTY: Operator[] = ['is_empty', 'is_not_empty']
const NUM: Operator[] = ['greater_than', 'less_than']
const AGE: Operator[] = ['older_than']
const COUNT: Operator[] = ['count_above']
const OPEN = ['active', 'inactive']
const DAY = 86_400_000

const days = (d: Date | null | undefined, now: Date) => (d ? Math.floor((now.getTime() - d.getTime()) / DAY) : null)
const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim()
const isActiveText = (status: string | null | undefined) => (String(status ?? 'Active').toLowerCase() === 'active' ? 'active' : 'inactive')

const staff: RecordTypeDef = {
  key: 'staff',
  label: 'staff member',
  plural: 'staff',
  activeOnly: true,
  fields: {
    department: { label: 'department', kind: 'text', category: 'employment', operators: TEXT },
    designation: { label: 'designation', kind: 'text', category: 'employment', operators: TEXT },
    status: { label: 'status', kind: 'status', category: 'employment', operators: STATE, values: OPEN },
    manager: { label: 'manager', kind: 'ref', category: 'employment', operators: EMPTY },
    tenure: { label: 'days of service', kind: 'number', category: 'employment', operators: NUM },
    hireDate: { label: 'hire date', kind: 'date', category: 'employment', operators: [...AGE, 'is_empty'] },
    basePay: { label: 'base pay', kind: 'number', category: 'compensation', operators: [...NUM, 'is_empty'] },
  },
  async load(db, companyId, now) {
    const rows = await db.staffRecord.findMany({
      where: { companyId },
      select: { id: true, staffId: true, firstName: true, lastName: true, department: true, position: true, hireDate: true, isActive: true, managerId: true, designation: { select: { title: true, basePay: true } } },
    })
    return rows.map((s) => ({
      id: s.id,
      label: fullName(s),
      ref: s.staffId,
      sub: s.department,
      active: s.isActive,
      v: {
        department: s.department ?? null,
        designation: s.designation?.title ?? s.position ?? null,
        status: s.isActive ? 'active' : 'inactive',
        manager: s.managerId ?? null,
        tenure: days(s.hireDate, now),
        hireDate: s.hireDate ?? null,
        basePay: s.designation?.basePay ?? null,
      },
    }))
  },
}

const department: RecordTypeDef = {
  key: 'department',
  label: 'department',
  plural: 'departments',
  activeOnly: true,
  fields: {
    name: { label: 'name', kind: 'text', category: null, operators: STATE },
    status: { label: 'status', kind: 'status', category: null, operators: STATE, values: OPEN },
    head: { label: 'head of department', kind: 'ref', category: 'employment', operators: EMPTY },
    businessUnit: { label: 'business unit', kind: 'text', category: null, operators: TEXT },
    staffCount: { label: 'active staff', kind: 'count', category: 'employment', operators: COUNT },
    createdAt: { label: 'created', kind: 'date', category: null, operators: AGE },
  },
  async load(db, companyId, now) {
    const rows = await db.department.findMany({
      where: { companyId },
      select: { id: true, name: true, code: true, status: true, headId: true, businessUnit: true, createdAt: true, _count: { select: { staff: { where: { isActive: true } } } } },
    })
    return rows.map((d) => ({
      id: d.id, label: d.name, ref: d.code, sub: d.businessUnit, active: isActiveText(d.status) === 'active',
      v: { name: d.name, status: isActiveText(d.status), head: d.headId ?? null, businessUnit: d.businessUnit ?? null, staffCount: d._count.staff, createdAt: d.createdAt },
    }))
  },
}

const designation: RecordTypeDef = {
  key: 'designation',
  label: 'designation',
  plural: 'designations',
  activeOnly: true,
  fields: {
    title: { label: 'title', kind: 'text', category: null, operators: STATE },
    status: { label: 'status', kind: 'status', category: null, operators: STATE, values: OPEN },
    basePay: { label: 'base pay', kind: 'number', category: 'compensation', operators: [...NUM, 'is_empty'] },
    staffCount: { label: 'active staff', kind: 'count', category: 'employment', operators: COUNT },
    createdAt: { label: 'created', kind: 'date', category: null, operators: AGE },
  },
  async load(db, companyId, now) {
    const rows = await db.designation.findMany({
      where: { companyId },
      select: { id: true, title: true, code: true, status: true, basePay: true, createdAt: true, _count: { select: { staffRecords: { where: { isActive: true } } } } },
    })
    return rows.map((d) => ({
      id: d.id, label: d.title, ref: d.code, sub: null, active: isActiveText(d.status) === 'active',
      v: { title: d.title, status: isActiveText(d.status), basePay: d.basePay ?? null, staffCount: d._count.staffRecords, createdAt: d.createdAt },
    }))
  },
}

const businessUnit: RecordTypeDef = {
  key: 'business_unit',
  label: 'business unit',
  plural: 'business units',
  activeOnly: true,
  fields: {
    name: { label: 'name', kind: 'text', category: null, operators: STATE },
    status: { label: 'status', kind: 'status', category: null, operators: STATE, values: OPEN },
    head: { label: 'head', kind: 'ref', category: 'employment', operators: EMPTY },
    departmentCount: { label: 'departments', kind: 'count', category: null, operators: COUNT },
    createdAt: { label: 'created', kind: 'date', category: null, operators: AGE },
  },
  async load(db, companyId, now) {
    const rows = await db.businessUnit.findMany({
      where: { companyId, OR: [{ archived: null }, { archived: 0 }] },
      select: { id: true, name: true, code: true, status: true, headId: true, createdAt: true, _count: { select: { departments: true } } },
    })
    return rows.map((b) => ({
      id: b.id, label: b.name, ref: b.code ?? b.name, sub: null, active: isActiveText(b.status) === 'active',
      v: { name: b.name, status: isActiveText(b.status), head: b.headId ?? null, departmentCount: b._count.departments, createdAt: b.createdAt },
    }))
  },
}

const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled']
const leaveRequest: RecordTypeDef = {
  key: 'leave_request',
  label: 'leave request',
  plural: 'leave requests',
  activeOnly: false,
  fields: {
    status: { label: 'status', kind: 'status', category: 'leave', operators: STATE, values: LEAVE_STATUSES },
    leaveType: { label: 'leave type', kind: 'text', category: 'leave', operators: STATE },
    totalDays: { label: 'days requested', kind: 'number', category: 'leave', operators: NUM },
    submitted: { label: 'submitted', kind: 'date', category: 'leave', operators: AGE },
  },
  async load(db, companyId, now) {
    const rows = await db.leaveRequest.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { id: true, referenceNumber: true, status: true, totalDays: true, createdAt: true, leaveType: { select: { name: true } }, staffRecord: { select: { firstName: true, lastName: true } } },
    })
    return rows.map((r) => ({
      id: r.id, label: `${fullName(r.staffRecord)}: ${r.leaveType.name}`, ref: r.referenceNumber ?? r.id, sub: r.leaveType.name, active: true,
      v: { status: String(r.status).toLowerCase(), leaveType: r.leaveType.name, totalDays: Number(r.totalDays), submitted: r.createdAt },
    }))
  },
}

const payrollTemplate: RecordTypeDef = {
  key: 'payroll_template',
  label: 'payroll template',
  plural: 'payroll templates',
  activeOnly: false,
  fields: {
    name: { label: 'name', kind: 'text', category: 'compensation', operators: STATE },
    fieldCount: { label: 'pay fields', kind: 'count', category: 'compensation', operators: COUNT },
    createdAt: { label: 'created', kind: 'date', category: 'compensation', operators: AGE },
    updatedAt: { label: 'last changed', kind: 'date', category: 'compensation', operators: AGE },
  },
  async load(db, companyId, now) {
    const rows = await db.payrollTemplate.findMany({
      where: { companyId },
      select: { id: true, templateName: true, createdAt: true, updatedAt: true, _count: { select: { fields: true } } },
    })
    return rows.map((t) => ({
      id: t.id, label: t.templateName, ref: t.templateName, sub: null, active: true,
      v: { name: t.templateName, fieldCount: t._count.fields, createdAt: t.createdAt, updatedAt: t.updatedAt },
    }))
  },
}

export const RECORD_TYPES: Record<RecordTypeKey, RecordTypeDef> = {
  staff,
  department,
  designation,
  business_unit: businessUnit,
  leave_request: leaveRequest,
  payroll_template: payrollTemplate,
}

export const isRecordType = (v: unknown): v is RecordTypeKey => typeof v === 'string' && (RECORD_TYPE_KEYS as readonly string[]).includes(v)
export const isCadence = (v: unknown): v is Cadence => typeof v === 'string' && (CADENCES as readonly string[]).includes(v)

// What the rule builder (and the assistant's tool description) offers, as plain data.
export function describeBuildingBlocks() {
  return RECORD_TYPE_KEYS.map((key) => {
    const t = RECORD_TYPES[key]
    return {
      key,
      label: t.label,
      plural: t.plural,
      activeOnly: t.activeOnly,
      fields: Object.entries(t.fields).map(([field, f]) => ({ field, label: f.label, kind: f.kind, category: f.category, operators: f.operators, ...(f.values ? { values: f.values } : {}) })),
    }
  })
}
