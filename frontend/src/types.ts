export type Role = 'ADMIN'

export interface User {
  _id: string
  id?: string
  email: string
  role: Role
  companyId: string
}

export interface Company {
  _id: string
  id?: string
  name: string
  createdAt?: string
  hqLocation?: { lat: number; lng: number; address?: string }
}

export interface IncidentType {
  _id: string
  id?: string
  code: string
  name: string
  defaultPriority: number
  defaultSetupRemote: number
  defaultFeasRemote: boolean
  defaultFeasOnsite: boolean
  requirements: {
    requiredSkills: string[]
    requiredToolsByMode: { R: string[]; O: string[] }
    requiredLicensesByMode: { R: string[]; O: string[] }
    requiresVehicleIfOnsite: boolean
  }
}

export interface Incident {
  _id: string
  id?: string
  companyId: string
  unitId: string
  componentId?: string
  typeCode: string
  priority: number
  status: string
  reportedAt: string
  resolvedAt?: string
  modeFeas: { R: boolean; O: boolean }
  setupRemote: number
  requirements: IncidentType['requirements']
  dispatch?: {
    dispatchRunId: string
    assignedTechId: string
    mode: 'R' | 'O'
    assignedAt: string
    allocatedTools: string[]
    allocatedLicenses: string[]
    vehicleAllocated: boolean
    timeToRestoreEstimateHours: number
  }
}

export interface Unit {
  _id: string
  id?: string
  name: string
  companyId: string
  location: { lat: number; lng: number; address?: string }
  remoteAccessReady: boolean
  isSupportStation?: boolean
  activeIncidents?: number
}

export interface Technician {
  _id: string
  id?: string
  name: string
  skills: string[]
  availableNow: boolean
  homeLocation?: { lat: number; lng: number; address?: string }
  dMatrix?: Array<{ typeCode: string; mode: string; durationHours: number }>
}

export interface Tool {
  _id: string
  id?: string
  name: string
  typeCode: string
  availableQty: number
}

export interface License {
  _id: string
  id?: string
  name: string
  typeCode: string
  capTotal: number
  inUseNow: number
}

export interface Vehicle {
  _id: string
  id?: string
  availableQty: number
}

export interface Skill {
  _id: string
  id?: string
  name: string
}

export interface Component {
  _id: string
  id?: string
  companyId: string
  unitId: string
  name: string
  type: string
  status: string
  location?: string | null
  serial?: string | null
  ipAddress?: string | null
  macAddress?: string | null
  vendor?: string | null
  model?: string | null
  os?: string | null
  cpu?: string | null
  ramGB?: number | null
  storageGB?: number | null
  firmware?: string | null
  networkConfig?: { subnet?: string | null; gateway?: string | null; vlan?: string | null } | null
  notes?: string | null
}

export interface OptimizeResult {
  dispatchRunId: string
  objectives: { Z1: number; Z2: number; Z3: number }
  assignments: Array<{
    incidentId: string
    technicianId: string
    mode: 'R' | 'O'
    allocatedTools: string[]
    allocatedLicenses: string[]
    vehicleAllocated: boolean
    timeToRestoreEstimateHours: number
  }>
  unassigned: Array<{
    incidentId: string
    typeCode: string
    priority: number
    reasons: string[]
  }>
  updatedIncidentIds: string[]
}

export interface DispatchRun {
  _id: string
  id?: string
  companyId: string
  createdAt: string
  incidentIds: string[]
  result: {
    assignments: Array<{
      incidentId: string
      technicianId: string
      mode: 'R' | 'O'
      allocatedTools: string[]
      allocatedLicenses: string[]
      vehicleAllocated: boolean
      timeToRestoreEstimateHours: number
    }>
    objectives: { Z1: number; Z2: number; Z3: number }
  }
  snapshot: {
    tools: Record<string, number>
    licenses: Record<string, number>
    vehicles: number
  }
}

// Helper: lay id tu object MongoDB (_id hoac id)
export function getId(obj: { _id?: string; id?: string } | null | undefined): string {
  if (!obj) return ''
  return obj._id ?? obj.id ?? ''
}

// Map priority so sang nhan
export const PRIORITY_LABEL: Record<number, { label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = {
  4: { label: 'Khẩn cấp',    color: 'error' },
  3: { label: 'Cao',         color: 'warning' },
  2: { label: 'Trung bình',  color: 'info' },
  1: { label: 'Thấp',        color: 'success' },
}