import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Collapse,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Select,
  Checkbox,
  Typography
} from '@mui/material'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import api from '../api'
import UnitPortal from './UnitPortal'
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
import type {
  Component,
  DispatchRun,
  Incident,
  IncidentType,
  OptimizeResult,
  Skill,
  Tool,
  License,
  Technician,
  Unit,
  User,
  Vehicle
} from '../types'

const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILES_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const MAP_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
const ROUTER_BASE_URL = (
  import.meta.env.VITE_ROUTER_URL || 'https://router.project-osrm.org'
).replace(/\/$/, '')

const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

const pulseIcon = L.divIcon({
  className: 'pulse-marker',
  html: '<span class="pulse-ring"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

const supportStationIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'support-station-icon'
})

function loadMapState(
  storageKey: string,
  fallback: { center: [number, number]; zoom: number }
): { center: [number, number]; zoom: number } {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const center = parsed?.center
    const zoom = parsed?.zoom
    if (!Array.isArray(center) || center.length !== 2) return fallback
    const lat = Number(center[0])
    const lng = Number(center[1])
    const z = Number(zoom)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(z)) return fallback
    return { center: [lat, lng], zoom: z }
  } catch {
    return fallback
  }
}

function MapStatePersistence({ storageKey }: { storageKey: string }) {
  useMapEvents({
    zoomend(event) {
      const map = event.target
      const center = map.getCenter()
      const zoom = map.getZoom()
      localStorage.setItem(storageKey, JSON.stringify({ center: [center.lat, center.lng], zoom }))
    },
    moveend(event) {
      const map = event.target
      const center = map.getCenter()
      const zoom = map.getZoom()
      localStorage.setItem(storageKey, JSON.stringify({ center: [center.lat, center.lng], zoom }))
    }
  })
  return null
}

function UnitLocationPicker({
  lat,
  lng,
  onChange,
  storageKey
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
  storageKey: string
}) {
  function ClickHandler() {
    useMapEvents({
      click(event) {
        onChange(event.latlng.lat, event.latlng.lng)
      }
    })
    return null
  }

  const fallback =
    lat != null && lng != null
      ? { center: [lat, lng] as [number, number], zoom: 12 }
      : { center: [16.0, 106.0] as [number, number], zoom: 5 }
  const persisted = loadMapState(storageKey, fallback)
  const center: [number, number] = persisted.center
  const zoom = persisted.zoom

  return (
    <Box className="unit-map-shell">
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        <MapStatePersistence storageKey={storageKey} />
        <ClickHandler />
        {lat != null && lng != null && <Marker position={[lat, lng]} />}
      </MapContainer>
    </Box>
  )
}

interface CompanyPortalProps {
  user: User
}

function CompanyPortal({ user }: CompanyPortalProps) {
  const [units, setUnits] = useState<Unit[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([])
  const [dispatchRuns, setDispatchRuns] = useState<DispatchRun[]>([])
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [unitAccessDialogUnit, setUnitAccessDialogUnit] = useState<Unit | null>(null)
  const [unitPortalUnit, setUnitPortalUnit] = useState<Unit | null>(null)
  const [routeLines, setRouteLines] = useState<Record<string, [number, number][]>>({})
  const unitNameById = useMemo(() => new Map(units.map((u) => [u._id, u.name])), [units])
  const unitById = useMemo(() => new Map(units.map((u) => [u._id, u])), [units])
  const techNameById = useMemo(() => new Map(technicians.map((t) => [t._id, t.name])), [technicians])
  const incidentById = useMemo(() => new Map(incidents.map((i) => [i._id, i])), [incidents])
  const componentNameById = new Map(components.map((c) => [c._id, c.name]))
  const [mainTab, setMainTab] = useState(0)
  const [manageTab, setManageTab] = useState(0)
  const [incidentPage, setIncidentPage] = useState(0)
  const [incidentPriorityEdits, setIncidentPriorityEdits] = useState<Record<string, number>>({})
  const [incidentModeREdits, setIncidentModeREdits] = useState<Record<string, boolean>>({})
  const [incidentModeOEdits, setIncidentModeOEdits] = useState<Record<string, boolean>>({})
  const [expandedIncidents, setExpandedIncidents] = useState<Record<string, boolean>>({})
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false)
  const [requirementsIncidentId, setRequirementsIncidentId] = useState<string | null>(null)
  const [requirementsForm, setRequirementsForm] = useState({
    requiredSkills: [] as string[],
    toolsR: [] as string[],
    toolsO: [] as string[],
    licensesR: [] as string[],
    licensesO: [] as string[],
    requiresVehicleIfOnsite: false
  })

  const [techForm, setTechForm] = useState({
    name: '',
    skills: [] as string[],
    lat: '',
    lng: '',
    address: '',
    availableNow: true,
    dMatrixRows: [] as Array<{ typeCode: string; mode: 'R' | 'O'; durationHours: string }>
  })
  const [toolForm, setToolForm] = useState({ name: '', typeCode: '', availableQty: 1 })
  const [licenseForm, setLicenseForm] = useState({ name: '', typeCode: '', capTotal: 1, inUseNow: 0 })
  const [vehicleForm, setVehicleForm] = useState({ availableQty: 1 })
  const [techDialogOpen, setTechDialogOpen] = useState(false)
  const [techDialogMode, setTechDialogMode] = useState<'add' | 'edit'>('add')
  const [editingTechId, setEditingTechId] = useState<string | null>(null)
  const [toolDialogOpen, setToolDialogOpen] = useState(false)
  const [toolDialogMode, setToolDialogMode] = useState<'add' | 'edit'>('add')
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false)
  const [licenseDialogMode, setLicenseDialogMode] = useState<'add' | 'edit'>('add')
  const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null)
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false)
  const [vehicleDialogMode, setVehicleDialogMode] = useState<'add' | 'edit'>('add')
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [unitDialogMode, setUnitDialogMode] = useState<'add' | 'edit'>('add')
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [deleteUnitDialogOpen, setDeleteUnitDialogOpen] = useState(false)
  const [deleteUnitTarget, setDeleteUnitTarget] = useState<Unit | null>(null)
  const [unitForm, setUnitForm] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    remoteAccessReady: false,
    isSupportStation: false
  })
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [skillDialogMode, setSkillDialogMode] = useState<'add' | 'edit'>('add')
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [skillForm, setSkillForm] = useState({ name: '' })
  const [incidentTypeDialogOpen, setIncidentTypeDialogOpen] = useState(false)
  const [incidentTypeDialogMode, setIncidentTypeDialogMode] = useState<'add' | 'edit'>('add')
  const [editingIncidentTypeId, setEditingIncidentTypeId] = useState<string | null>(null)
  const [incidentTypeForm, setIncidentTypeForm] = useState({
    code: '',
    name: '',
    defaultPriority: 3,
    defaultSetupRemote: 0.5,
    defaultFeasRemote: true,
    defaultFeasOnsite: true,
    requiredSkills: [] as string[],
    toolsR: '',
    toolsO: '',
    licensesR: '',
    licensesO: '',
    requiresVehicleIfOnsite: false
  })

  const availableTechs = technicians.filter((t) => t.availableNow).length
  const vehicleQty = vehicles.reduce((sum, v) => sum + v.availableQty, 0)
  const existingStation = units.find((u) => u.isSupportStation)
  const stationLocked = Boolean(existingStation && existingStation._id !== editingUnitId)
  const stationLocation = existingStation?.location

  const companyUnitsMapKey = `company-units-map:${user.companyId}`
  const companyUnitsMapInitial = loadMapState(companyUnitsMapKey, { center: [16.0, 106.0], zoom: 5 })

  const unitLocationPickerKey = `unit-location-picker:${user.companyId}:${editingUnitId ?? 'new'}`
  const stationReady = Boolean(stationLocation)
  const toolTypeOptions = Array.from(
    new Map(
      [
        ...tools.map((tool) => [tool.typeCode, tool.name]),
        ...requirementsForm.toolsR.map((code) => [code, code]),
        ...requirementsForm.toolsO.map((code) => [code, code])
      ] as Array<[string, string]>
    ).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))
  const licenseTypeOptions = Array.from(
    new Map(
      [
        ...licenses.map((lic) => [lic.typeCode, lic.name]),
        ...requirementsForm.licensesR.map((code) => [code, code]),
        ...requirementsForm.licensesO.map((code) => [code, code])
      ] as Array<[string, string]>
    ).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))

  // FIX: dung useMemo de on dinh tham chieu, tranh useEffect chay lap vo han
  const activeIncidents = useMemo(
    () => incidents.filter((inc) => inc.status !== 'RESOLVED'),
    [incidents]
  )
  const dispatchedIncidents = useMemo(
    () => activeIncidents.filter((inc) => Boolean(inc.dispatch)),
    [activeIncidents]
  )
  const dispatchedKey = useMemo(
    () => dispatchedIncidents.map((d) => `${d._id}:${d.dispatch?.mode}`).join(','),
    [dispatchedIncidents]
  )

  const incidentRowsPerPage = 5
  const pagedIncidents = activeIncidents.slice(
    incidentPage * incidentRowsPerPage,
    incidentPage * incidentRowsPerPage + incidentRowsPerPage
  )
  const statusLabel = (status: string) => {
    if (status === 'DISPATCHED' || status === 'IN_PROGRESS' || status === 'DISPATCHING') return 'Dang dieu phoi'
    if (status === 'OPEN') return 'Mo'
    if (status === 'RESOLVED') return 'Hoan tat'
    return status
  }
  const statusBuckets = [
    { key: 'OPEN', label: 'Mo', color: '#0277bd' },
    { key: 'DISPATCHING', label: 'Dang dieu phoi', color: '#f9a825' },
    { key: 'RESOLVED', label: 'Hoan tat', color: '#2e7d32' }
  ]
  const rawStatusCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1
    return acc
  }, {})
  const statusCounts: Record<string, number> = {
    OPEN: rawStatusCounts.OPEN ?? 0,
    DISPATCHING: (rawStatusCounts.DISPATCHED ?? 0) + (rawStatusCounts.IN_PROGRESS ?? 0),
    RESOLVED: rawStatusCounts.RESOLVED ?? 0
  }
  const maxStatusCount = Math.max(1, ...statusBuckets.map((b) => statusCounts[b.key] ?? 0))
  const typeCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.typeCode] = (acc[inc.typeCode] ?? 0) + 1
    return acc
  }, {})
  const typeData = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const maxTypeCount = Math.max(1, ...typeData.map(([, count]) => count))

  const load = async () => {
    try { // FIX: them try/catch de tranh loi load lam sap toan bo
      const [unitsRes, incRes, techRes, toolRes, licRes, vehRes, compRes, skillsRes, typesRes, runsRes] =
        await Promise.all([
          api.get<Unit[]>(`/api/companies/${user.companyId}/units/map`),
          api.get<Incident[]>('/api/incidents?scope=company'),
          api.get<Technician[]>('/api/technicians'),
          api.get<Tool[]>('/api/tools'),
          api.get<License[]>('/api/licenses'),
          api.get<Vehicle[]>('/api/vehicles'),
          api.get<Component[]>('/api/components?scope=company'),
          api.get<Skill[]>('/api/skills'),
          api.get<IncidentType[]>('/api/incident-types'),
          api.get<DispatchRun[]>('/api/dispatch-runs')
        ])
      setUnits((unitsRes.data as Unit[]).map((u) => ({ ...u, id: u._id })))
      setIncidents(incRes.data)
      setTechnicians(techRes.data)
      setTools(toolRes.data)
      setLicenses(licRes.data)
      setVehicles(vehRes.data)
      setComponents(compRes.data)
      setSkills(skillsRes.data)
      setIncidentTypes(typesRes.data)
      setDispatchRuns(runsRes.data)
      setIncidentPriorityEdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.priority])))
      setIncidentModeREdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.modeFeas?.R ?? false])))
      setIncidentModeOEdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.modeFeas?.O ?? false])))
    } catch (err) {
      console.error('load() failed:', err)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [])

  // FIX: useEffect lay duong di — dung dispatchedIncidents thay vi onsiteDispatches,
  // dependency la dispatchedKey (chuoi on dinh) thay vi mang tao moi moi render
  useEffect(() => {
    if (!stationLocation) {
      setRouteLines({})
      return
    }
    const requests = dispatchedIncidents
      .map((inc) => {
        const unit = unitById.get(inc.unitId)
        if (!unit?.location) return null
        return { incidentId: inc._id, unit, mode: inc.dispatch?.mode }
      })
      .filter(Boolean) as Array<{ incidentId: string; unit: Unit; mode?: string }>
    if (requests.length === 0) {
      setRouteLines({})
      return
    }
    const controller = new AbortController()
    const fetchRoutes = async () => {
      const entries = await Promise.all(
        requests.map(async ({ incidentId, unit }) => {
          const url = `${ROUTER_BASE_URL}/route/v1/driving/${stationLocation.lng},${stationLocation.lat};${unit.location.lng},${unit.location.lat}?overview=full&geometries=geojson`
          try {
            const res = await fetch(url, { signal: controller.signal })
            if (!res.ok) {
              throw new Error('route fetch failed')
            }
            const data = await res.json()
            const coords = data.routes?.[0]?.geometry?.coordinates
            if (!coords || coords.length === 0) {
              throw new Error('no route')
            }
            const latlngs = coords.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
            )
            return [incidentId, latlngs] as const
          } catch {
            // Fallback: duong thang
            return [
              incidentId,
              [
                [stationLocation.lat, stationLocation.lng],
                [unit.location.lat, unit.location.lng]
              ] as [number, number][]
            ] as const
          }
        })
      )
      if (!controller.signal.aborted) {
        setRouteLines(Object.fromEntries(entries))
      }
    }
    fetchRoutes()
    return () => controller.abort()
  }, [stationLocation, dispatchedKey, unitById])

  const handleOptimize = async () => {
    setOptimizing(true)
    try {
      const res = await api.post<OptimizeResult>('/api/optimize/dispatch-now', {})
      setResult(res.data)
      await load()
    } finally {
      setOptimizing(false)
    }
  }

  const handleUnitMarkerClick = (unit: Unit) => {
    if (unit.isSupportStation) return
    setUnitAccessDialogUnit(unit)
  }

  const handleConfirmUnitAccess = (mode: 'unit') => {
    const unit = unitAccessDialogUnit
    if (!unit) return
    setUnitAccessDialogUnit(null)
    if (mode === 'unit') {
      setUnitPortalUnit(unit)
    }
  }

  const openAddTech = () => {
    setTechDialogMode('add')
    setEditingTechId(null)
    const stationLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const stationLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const stationAddress = stationLocation?.address ?? ''
    setTechForm({
      name: '',
      skills: [],
      lat: stationLat,
      lng: stationLng,
      address: stationAddress,
      availableNow: true,
      dMatrixRows: []
    })
    setTechDialogOpen(true)
  }

  const openEditTech = (tech: Technician) => {
    setTechDialogMode('edit')
    setEditingTechId(tech._id)
    const stationLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const stationLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const stationAddress = stationLocation?.address ?? ''
    setTechForm({
      name: tech.name ?? '',
      skills: tech.skills ?? [],
      lat: stationLat || (tech.homeLocation?.lat != null ? String(tech.homeLocation.lat) : ''),
      lng: stationLng || (tech.homeLocation?.lng != null ? String(tech.homeLocation.lng) : ''),
      address: stationAddress || tech.homeLocation?.address || '',
      availableNow: Boolean(tech.availableNow),
      dMatrixRows: (tech.dMatrix || []).map((entry) => ({
        typeCode: entry.typeCode,
        mode: entry.mode as 'R' | 'O',
        durationHours: String(entry.durationHours)
      }))
    })
    setTechDialogOpen(true)
  }

  const closeTechDialog = () => {
    setTechDialogOpen(false)
  }

  const handleSubmitTech = async () => {
    if (!stationLocation) return
    const lat = Number(stationLocation.lat)
    const lng = Number(stationLocation.lng)
    const dMatrix = techForm.dMatrixRows
      .filter((row) => row.typeCode && row.durationHours !== '')
      .map((row) => ({
        typeCode: row.typeCode,
        mode: row.mode,
        durationHours: Number(row.durationHours)
      }))
    const payload = {
      name: techForm.name,
      skills: techForm.skills,
      availableNow: techForm.availableNow,
      homeLocation: { lat, lng, address: stationLocation.address },
      dMatrix
    }
    if (techDialogMode === 'add') {
      await api.post('/api/technicians', payload)
    } else if (editingTechId) {
      await api.patch(`/api/technicians/${editingTechId}`, payload)
    }
    setTechDialogOpen(false)
    await load()
  }

  const handleDeleteTech = async (techId: string) => {
    await api.delete(`/api/technicians/${techId}`)
    await load()
  }

  const openAddTool = () => {
    setToolDialogMode('add')
    setEditingToolId(null)
    setToolForm({ name: '', typeCode: '', availableQty: 1 })
    setToolDialogOpen(true)
  }

  const openEditTool = (tool: Tool) => {
    setToolDialogMode('edit')
    setEditingToolId(tool._id)
    setToolForm({ name: tool.name, typeCode: tool.typeCode, availableQty: tool.availableQty })
    setToolDialogOpen(true)
  }

  const closeToolDialog = () => {
    setToolDialogOpen(false)
  }

  const handleSubmitTool = async () => {
    const payload = {
      name: toolForm.name,
      typeCode: toolForm.typeCode,
      availableQty: Number(toolForm.availableQty)
    }
    if (toolDialogMode === 'add') {
      await api.post('/api/tools', payload)
    } else if (editingToolId) {
      await api.patch(`/api/tools/${editingToolId}`, payload)
    }
    setToolDialogOpen(false)
    await load()
  }

  const handleDeleteTool = async (toolId: string) => {
    await api.delete(`/api/tools/${toolId}`)
    await load()
  }

  const openAddLicense = () => {
    setLicenseDialogMode('add')
    setEditingLicenseId(null)
    setLicenseForm({ name: '', typeCode: '', capTotal: 1, inUseNow: 0 })
    setLicenseDialogOpen(true)
  }

  const openEditLicense = (license: License) => {
    setLicenseDialogMode('edit')
    setEditingLicenseId(license._id)
    setLicenseForm({
      name: license.name,
      typeCode: license.typeCode,
      capTotal: license.capTotal,
      inUseNow: license.inUseNow
    })
    setLicenseDialogOpen(true)
  }

  const closeLicenseDialog = () => {
    setLicenseDialogOpen(false)
  }

  const handleSubmitLicense = async () => {
    const payload = {
      name: licenseForm.name,
      typeCode: licenseForm.typeCode,
      capTotal: Number(licenseForm.capTotal),
      inUseNow: Number(licenseForm.inUseNow)
    }
    if (licenseDialogMode === 'add') {
      await api.post('/api/licenses', payload)
    } else if (editingLicenseId) {
      await api.patch(`/api/licenses/${editingLicenseId}`, payload)
    }
    setLicenseDialogOpen(false)
    await load()
  }

  const handleDeleteLicense = async (licenseId: string) => {
    await api.delete(`/api/licenses/${licenseId}`)
    await load()
  }

  const openAddVehicle = () => {
    setVehicleDialogMode('add')
    setEditingVehicleId(null)
    setVehicleForm({ availableQty: 1 })
    setVehicleDialogOpen(true)
  }

  const openEditVehicle = (vehicle: Vehicle) => {
    setVehicleDialogMode('edit')
    setEditingVehicleId(vehicle._id)
    setVehicleForm({ availableQty: vehicle.availableQty })
    setVehicleDialogOpen(true)
  }

  const closeVehicleDialog = () => {
    setVehicleDialogOpen(false)
  }

  const handleSubmitVehicle = async () => {
    const payload = { availableQty: Number(vehicleForm.availableQty) }
    if (vehicleDialogMode === 'add') {
      await api.post('/api/vehicles', payload)
    } else if (editingVehicleId) {
      await api.patch(`/api/vehicles/${editingVehicleId}`, payload)
    }
    setVehicleDialogOpen(false)
    await load()
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    await api.delete(`/api/vehicles/${vehicleId}`)
    await load()
  }

  const handleSaveIncidentConfig = async (incidentId: string) => {
    await api.patch(`/api/incidents/${incidentId}`, {
      priority: Number(incidentPriorityEdits[incidentId] ?? 1),
      modeFeas: {
        R: Boolean(incidentModeREdits[incidentId]),
        O: Boolean(incidentModeOEdits[incidentId])
      }
    })
    await load()
  }

  const openRequirementsDialog = (incident: Incident) => {
    const req = incident.requirements || {
      requiredSkills: [],
      requiredToolsByMode: { R: [], O: [] },
      requiredLicensesByMode: { R: [], O: [] },
      requiresVehicleIfOnsite: false
    }
    setRequirementsIncidentId(incident._id)
    setRequirementsForm({
      requiredSkills: req.requiredSkills || [],
      toolsR: req.requiredToolsByMode?.R || [],
      toolsO: req.requiredToolsByMode?.O || [],
      licensesR: req.requiredLicensesByMode?.R || [],
      licensesO: req.requiredLicensesByMode?.O || [],
      requiresVehicleIfOnsite: Boolean(req.requiresVehicleIfOnsite)
    })
    setRequirementsDialogOpen(true)
  }

  const handleSaveRequirements = async () => {
    if (!requirementsIncidentId) return
    await api.patch(`/api/incidents/${requirementsIncidentId}`, {
      requirements: {
        requiredSkills: requirementsForm.requiredSkills,
        requiredToolsByMode: {
          R: requirementsForm.toolsR,
          O: requirementsForm.toolsO
        },
        requiredLicensesByMode: {
          R: requirementsForm.licensesR,
          O: requirementsForm.licensesO
        },
        requiresVehicleIfOnsite: requirementsForm.requiresVehicleIfOnsite
      }
    })
    setRequirementsDialogOpen(false)
    await load()
  }

  const handleCancelDispatch = async (incidentId: string) => {
    await api.post(`/api/incidents/${incidentId}/cancel`)
    await load()
  }

  const toggleIncidentExpand = (incidentId: string) => {
    setExpandedIncidents((prev) => ({ ...prev, [incidentId]: !prev[incidentId] }))
  }

  const toggleRunExpand = (runId: string) => {
    setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
  }

  const openAddUnit = () => {
    setUnitDialogMode('add')
    setEditingUnitId(null)
    setUnitForm({ name: '', address: '', lat: '', lng: '', remoteAccessReady: false, isSupportStation: false })
    setUnitDialogOpen(true)
  }

  const openEditUnit = (unit: Unit) => {
    setUnitDialogMode('edit')
    setEditingUnitId(unit._id)
    setUnitForm({
      name: unit.name ?? '',
      address: unit.location?.address ?? '',
      lat: unit.location?.lat != null ? String(unit.location.lat) : '',
      lng: unit.location?.lng != null ? String(unit.location.lng) : '',
      remoteAccessReady: Boolean(unit.remoteAccessReady),
      isSupportStation: Boolean(unit.isSupportStation)
    })
    setUnitDialogOpen(true)
  }

  const closeUnitDialog = () => {
    setUnitDialogOpen(false)
  }

  const handleSubmitUnit = async () => {
    const lat = Number(unitForm.lat)
    const lng = Number(unitForm.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return
    if (unitForm.isSupportStation && existingStation && existingStation._id !== editingUnitId) return
    const payload = {
      name: unitForm.name,
      location: { lat, lng, address: unitForm.address },
      remoteAccessReady: unitForm.remoteAccessReady,
      isSupportStation: unitForm.isSupportStation
    }
    if (unitDialogMode === 'add') {
      await api.post(`/api/companies/${user.companyId}/units`, payload)
    } else if (editingUnitId) {
      await api.patch(`/api/companies/${user.companyId}/units/${editingUnitId}`, payload)
    }
    setUnitDialogOpen(false)
    await load()
  }

  const openDeleteUnitDialog = (unit: Unit) => {
    setDeleteUnitTarget(unit)
    setDeleteUnitDialogOpen(true)
  }

  const closeDeleteUnitDialog = () => {
    setDeleteUnitDialogOpen(false)
    setDeleteUnitTarget(null)
  }

  const handleConfirmDeleteUnit = async () => {
    if (!deleteUnitTarget) return
    await api.delete(`/api/companies/${user.companyId}/units/${deleteUnitTarget._id}`)
    closeDeleteUnitDialog()
    await load()
  }

  const handleSubmitSkill = async () => {
    if (!skillForm.name.trim()) return
    if (skillDialogMode === 'add') {
      await api.post('/api/skills', { name: skillForm.name.trim() })
    } else if (editingSkillId) {
      await api.patch(`/api/skills/${editingSkillId}`, { name: skillForm.name.trim() })
    }
    setSkillDialogOpen(false)
    await load()
  }

  const parseList = (value: string) =>
    value.split(',').map((s) => s.trim()).filter(Boolean)

  const handleSubmitIncidentType = async () => {
    const payload = {
      code: incidentTypeForm.code,
      name: incidentTypeForm.name,
      defaultPriority: Number(incidentTypeForm.defaultPriority),
      defaultSetupRemote: Number(incidentTypeForm.defaultSetupRemote),
      defaultFeasRemote: Boolean(incidentTypeForm.defaultFeasRemote),
      defaultFeasOnsite: Boolean(incidentTypeForm.defaultFeasOnsite),
      requirements: {
        requiredSkills: incidentTypeForm.requiredSkills,
        requiredToolsByMode: {
          R: parseList(incidentTypeForm.toolsR),
          O: parseList(incidentTypeForm.toolsO)
        },
        requiredLicensesByMode: {
          R: parseList(incidentTypeForm.licensesR),
          O: parseList(incidentTypeForm.licensesO)
        },
        requiresVehicleIfOnsite: Boolean(incidentTypeForm.requiresVehicleIfOnsite)
      }
    }
    if (incidentTypeDialogMode === 'add') {
      await api.post('/api/incident-types', payload)
    } else if (editingIncidentTypeId) {
      await api.patch(`/api/incident-types/${editingIncidentTypeId}`, {
        name: payload.name,
        defaultPriority: payload.defaultPriority,
        defaultSetupRemote: payload.defaultSetupRemote,
        defaultFeasRemote: payload.defaultFeasRemote,
        defaultFeasOnsite: payload.defaultFeasOnsite,
        requirements: payload.requirements
      })
    }
    setIncidentTypeDialogOpen(false)
    await load()
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Bang dieu khien doanh nghiep</Typography>
      <Tabs value={mainTab} onChange={(_, value) => setMainTab(value)}>
        <Tab label="Dieu phoi" />
        <Tab label="Quan tri" />
      </Tabs>

      {mainTab === 0 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Su co dang xu ly</Typography>
                <Typography variant="caption" color="text.secondary">
                  Hien thi {Math.min(activeIncidents.length, incidentRowsPerPage)} tren {activeIncidents.length}
                </Typography>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Loai</TableCell>
                    <TableCell>Thanh phan</TableCell>
                    <TableCell>Trang thai</TableCell>
                    <TableCell>Do uu tien</TableCell>
                    <TableCell>Don vi</TableCell>
                    <TableCell>Tinh kha thi (che do)</TableCell>
                    <TableCell>Thoi diem bao cao</TableCell>
                    <TableCell>Yeu cau</TableCell>
                    <TableCell>Thao tac</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedIncidents.map((inc) => {
                    const isEditable = inc.status === 'OPEN'
                    const isExpandable = Boolean(inc.dispatch)
                    return (
                      <Fragment key={inc._id}>
                        <TableRow>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleIncidentExpand(inc._id)}
                              disabled={!isExpandable}
                            >
                              {expandedIncidents[inc._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                            </IconButton>
                          </TableCell>
                          <TableCell>{inc.typeCode}</TableCell>
                          <TableCell>{componentNameById.get(inc.componentId) || inc.componentId}</TableCell>
                          <TableCell>{statusLabel(inc.status)}</TableCell>
                          <TableCell>
                            <TextField
                              type="number"
                              size="small"
                              value={incidentPriorityEdits[inc._id] ?? inc.priority}
                              onChange={(e) =>
                                setIncidentPriorityEdits((prev) => ({ ...prev, [inc._id]: Number(e.target.value) }))
                              }
                              disabled={!isEditable}
                              sx={{ width: 90 }}
                            />
                          </TableCell>
                          <TableCell>{unitNameById.get(inc.unitId) || inc.unitId}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={incidentModeREdits[inc._id] ?? inc.modeFeas.R}
                                    onChange={(e) =>
                                      setIncidentModeREdits((prev) => ({ ...prev, [inc._id]: e.target.checked }))
                                    }
                                    disabled={!isEditable}
                                    size="small"
                                  />
                                }
                                label="R"
                              />
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={incidentModeOEdits[inc._id] ?? inc.modeFeas.O}
                                    onChange={(e) =>
                                      setIncidentModeOEdits((prev) => ({ ...prev, [inc._id]: e.target.checked }))
                                    }
                                    disabled={!isEditable}
                                    size="small"
                                  />
                                }
                                label="O"
                              />
                            </Stack>
                          </TableCell>
                          <TableCell>{new Date(inc.reportedAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Ky nang: {inc.requirements?.requiredSkills?.length ?? 0} | Cong cu (TX/TC):
                              {inc.requirements?.requiredToolsByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredToolsByMode?.O?.length ?? 0} | Cong cu phan mem (TX/TC):
                              {inc.requirements?.requiredLicensesByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredLicensesByMode?.O?.length ?? 0} | Phuong tien:
                              {inc.requirements?.requiresVehicleIfOnsite ? 'Co' : 'Khong'}
                            </Typography>
                            <Button size="small" onClick={() => openRequirementsDialog(inc)}>
                              Chinh sua
                            </Button>
                          </TableCell>
                          <TableCell>
                            {isEditable ? (
                              <Button size="small" onClick={() => handleSaveIncidentConfig(inc._id)}>
                                Luu
                              </Button>
                            ) : (
                              (inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                                <Button size="small" color="warning" onClick={() => handleCancelDispatch(inc._id)}>
                                  Huy dieu phoi
                                </Button>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={10} sx={{ py: 0 }}>
                            <Collapse in={expandedIncidents[inc._id]} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  Nguon luc da dieu phoi
                                </Typography>
                                {inc.dispatch ? (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Ky thuat vien</TableCell>
                                        <TableCell>Che do</TableCell>
                                        <TableCell>Cong cu</TableCell>
                                        <TableCell>Cong cu phan mem</TableCell>
                                        <TableCell>Phuong tien</TableCell>
                                        <TableCell>Thoi gian den du kien (gio)</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      <TableRow>
                                        <TableCell>
                                          {techNameById.get(inc.dispatch.assignedTechId) || inc.dispatch.assignedTechId}
                                        </TableCell>
                                        <TableCell>{inc.dispatch.mode}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedTools.join(', ') || 'Khong co'}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedLicenses.join(', ') || 'Khong co'}</TableCell>
                                        <TableCell>{inc.dispatch.vehicleAllocated ? 'Co' : 'Khong'}</TableCell>
                                        <TableCell>{inc.dispatch.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Chua co dieu phoi nao duoc gan.
                                  </Typography>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={activeIncidents.length}
                page={incidentPage}
                onPageChange={(_, newPage) => setIncidentPage(newPage)}
                rowsPerPage={incidentRowsPerPage}
                rowsPerPageOptions={[incidentRowsPerPage]}
              />
            </CardContent>
          </Card>

          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={4}>
              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Nguon luc
                    </Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Danh muc</TableCell>
                            <TableCell>Ten</TableCell>
                            <TableCell>Ma</TableCell>
                            <TableCell align="right">Kha dung</TableCell>
                            <TableCell align="right">Tong</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>Ky thuat vien</TableCell>
                            <TableCell>Ky thuat vien san sang</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{availableTechs}</TableCell>
                            <TableCell align="right">{technicians.length}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Phuong tien</TableCell>
                            <TableCell>Nguon phuong tien</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                          </TableRow>
                          {tools.map((tool) => (
                            <TableRow key={tool._id}>
                              <TableCell>Cong cu</TableCell>
                              <TableCell>{tool.name}</TableCell>
                              <TableCell>{tool.typeCode}</TableCell>
                              <TableCell align="right">{tool.availableQty}</TableCell>
                              <TableCell align="right">-</TableCell>
                            </TableRow>
                          ))}
                          {licenses.map((lic) => (
                            <TableRow key={lic._id}>
                              <TableCell>Cong cu phan mem</TableCell>
                              <TableCell>{lic.name}</TableCell>
                              <TableCell>{lic.typeCode}</TableCell>
                              <TableCell align="right">{lic.capTotal - lic.inUseNow}</TableCell>
                              <TableCell align="right">{lic.capTotal}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                    <Button sx={{ mt: 2 }} variant="contained" onClick={handleOptimize} disabled={optimizing} fullWidth>
                      Toi uu dieu phoi ngay
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Thong ke su co
                    </Typography>
                    <Stack spacing={1.5}>
                      {statusBuckets.map((bucket) => {
                        const count = statusCounts[bucket.key] ?? 0
                        return (
                          <Box key={bucket.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ width: 88 }}>
                              {bucket.label}
                            </Typography>
                            <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                              <Box
                                sx={{
                                  width: `${(count / maxStatusCount) * 100}%`,
                                  height: '100%',
                                  backgroundColor: bucket.color,
                                  borderRadius: 4
                                }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>
                              {count}
                            </Typography>
                          </Box>
                        )
                      })}
                    </Stack>

                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Cac loai su co noi bat
                    </Typography>
                    <Stack spacing={1.5}>
                      {typeData.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Chua ghi nhan su co.
                        </Typography>
                      )}
                      {typeData.map(([typeCode, count]) => (
                        <Box key={typeCode} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ width: 110 }}>
                            {typeCode}
                          </Typography>
                          <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                            <Box
                              sx={{
                                width: `${(count / maxTypeCount) * 100}%`,
                                height: '100%',
                                backgroundColor: '#546e7a',
                                borderRadius: 4
                              }}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>
                            {count}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
            <Grid item xs={12} md={8}>
              <Card sx={{ height: { xs: 420, md: 'calc(100vh - 220px)' }, minHeight: 420 }}>
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    Ban do don vi
                  </Typography>
                  <Box className="map-shell">
                    <MapContainer
                      center={companyUnitsMapInitial.center}
                      zoom={companyUnitsMapInitial.zoom}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
                      <MapStatePersistence storageKey={companyUnitsMapKey} />

                      {/* FIX: dung dispatchedIncidents thay vi onsiteDispatches,
                          phan biet mau do (tai cho O) va xanh net dut (tu xa R) */}
                      {stationLocation &&
                        dispatchedIncidents.map((inc) => {
                          const unit = unitById.get(inc.unitId)
                          if (!unit?.location) return null
                          const route = routeLines[inc._id] ?? [
                            [stationLocation.lat, stationLocation.lng],
                            [unit.location.lat, unit.location.lng]
                          ]
                          const isOnsite = inc.dispatch?.mode === 'O'
                          return (
                            <Polyline
                              key={`route-${inc._id}`}
                              positions={route}
                              pathOptions={{
                                color: isOnsite ? '#d32f2f' : '#1976d2',
                                weight: 3,
                                dashArray: isOnsite ? undefined : '10 6',
                                opacity: 0.8
                              }}
                            >
                              <Tooltip sticky>
                                {isOnsite ? 'Tai cho' : 'Tu xa'}: {inc.typeCode} - {unit.name}
                              </Tooltip>
                            </Polyline>
                          )
                        })}

                      {units.map((unit) => (
                        <Fragment key={unit._id}>
                          {unit.activeIncidents && unit.activeIncidents > 0 && (
                            <Marker
                              position={[unit.location.lat, unit.location.lng]}
                              icon={pulseIcon}
                              interactive={false}
                            />
                          )}
                          <Marker
                            position={[unit.location.lat, unit.location.lng]}
                            icon={unit.isSupportStation ? supportStationIcon : DefaultIcon}
                            eventHandlers={{ click: () => handleUnitMarkerClick(unit) }}
                          >
                            <Tooltip direction="top" offset={[0, -18]} permanent className="unit-label-tooltip">
                              {unit.name}
                            </Tooltip>
                            <Popup>
                              <Typography variant="subtitle2">{unit.name}</Typography>
                              <Typography variant="caption" display="block">
                                {unit.isSupportStation
                                  ? 'Tram ung cuu'
                                  : `Su co dang hoat dong: ${unit.activeIncidents ?? 0}`}
                              </Typography>
                              {!unit.isSupportStation && (
                                <Box mt={1}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="info"
                                    fullWidth
                                    onClick={() => handleUnitMarkerClick(unit)}
                                  >
                                    Truy cap don vi
                                  </Button>
                                </Box>
                              )}
                            </Popup>
                          </Marker>
                        </Fragment>
                      ))}
                    </MapContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Lich su dieu phoi
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Thoi diem chay</TableCell>
                    <TableCell>Phan cong</TableCell>
                    <TableCell>Muc tieu</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dispatchRuns.map((run) => (
                    <Fragment key={run._id}>
                      <TableRow>
                        <TableCell>
                          <IconButton size="small" onClick={() => toggleRunExpand(run._id)}>
                            {expandedRuns[run._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{run.result.assignments.length}</TableCell>
                        <TableCell>
                          Z1={run.result.objectives.Z1} | Z2={run.result.objectives.Z2} | Z3={run.result.objectives.Z3}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} sx={{ py: 0 }}>
                          <Collapse in={expandedRuns[run._id]} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Nguon luc da dieu phoi
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Su co</TableCell>
                                    <TableCell>Don vi</TableCell>
                                    <TableCell>Ky thuat vien</TableCell>
                                    <TableCell>Che do</TableCell>
                                    <TableCell>Cong cu</TableCell>
                                    <TableCell>Cong cu phan mem</TableCell>
                                    <TableCell>Phuong tien</TableCell>
                                    <TableCell>Thoi gian den du kien (gio)</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {run.result.assignments.map((assignment) => {
                                    const incident = incidentById.get(assignment.incidentId)
                                    const unit = incident ? unitNameById.get(incident.unitId) : undefined
                                    return (
                                      <TableRow key={`${run._id}-${assignment.incidentId}-${assignment.technicianId}`}>
                                        <TableCell>{incident?.typeCode || assignment.incidentId}</TableCell>
                                        <TableCell>{unit || incident?.unitId || '-'}</TableCell>
                                        <TableCell>
                                          {techNameById.get(assignment.technicianId) || assignment.technicianId}
                                        </TableCell>
                                        <TableCell>{assignment.mode}</TableCell>
                                        <TableCell>{assignment.allocatedTools.join(', ') || 'Khong co'}</TableCell>
                                        <TableCell>{assignment.allocatedLicenses.join(', ') || 'Khong co'}</TableCell>
                                        <TableCell>{assignment.vehicleAllocated ? 'Co' : 'Khong'}</TableCell>
                                        <TableCell>{assignment.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Stack>
      )}

      {mainTab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Quan tri
            </Typography>
            <Tabs value={manageTab} onChange={(_, value) => setManageTab(value)} sx={{ mb: 2 }}>
              <Tab label="Don vi" />
              <Tab label="Ky thuat vien" />
              <Tab label="Nguon luc" />
              <Tab label="Ky nang" />
              <Tab label="Loai su co" />
            </Tabs>

            {manageTab === 0 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Don vi</Typography>
                    <Button variant="contained" size="small" onClick={openAddUnit}>
                      Them don vi
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ten</TableCell>
                        <TableCell>Loai</TableCell>
                        <TableCell>Dia chi</TableCell>
                        <TableCell>Vi do</TableCell>
                        <TableCell>Kinh do</TableCell>
                        <TableCell>Truy cap tu xa</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {units.map((unit) => (
                        <TableRow key={unit._id}>
                          <TableCell>{unit.name}</TableCell>
                          <TableCell>{unit.isSupportStation ? 'Tram ho tro' : 'Don vi'}</TableCell>
                          <TableCell>{unit.location?.address || '-'}</TableCell>
                          <TableCell>{unit.location?.lat}</TableCell>
                          <TableCell>{unit.location?.lng}</TableCell>
                          <TableCell>{unit.remoteAccessReady ? 'Co' : 'Khong'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditUnit(unit)}>
                                Chinh sua
                              </Button>
                              <Button size="small" color="error" onClick={() => openDeleteUnitDialog(unit)}>
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 1 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Ky thuat vien</Typography>
                    <Button variant="contained" size="small" onClick={openAddTech} disabled={!stationReady}>
                      Them ky thuat vien
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ten</TableCell>
                        <TableCell>Ky nang</TableCell>
                        <TableCell>San sang</TableCell>
                        <TableCell>Vi do cu tru</TableCell>
                        <TableCell>Kinh do cu tru</TableCell>
                        <TableCell>dMatrix</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {technicians.map((tech) => (
                        <TableRow key={tech._id}>
                          <TableCell>{tech.name}</TableCell>
                          <TableCell>{tech.skills.join(', ') || '-'}</TableCell>
                          <TableCell>{tech.availableNow ? 'Co' : 'Khong'}</TableCell>
                          <TableCell>{stationLocation?.lat ?? tech.homeLocation?.lat ?? '-'}</TableCell>
                          <TableCell>{stationLocation?.lng ?? tech.homeLocation?.lng ?? '-'}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block', maxWidth: 220 }}>
                              {tech.dMatrix ? JSON.stringify(tech.dMatrix) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditTech(tech)}>
                                Chinh sua
                              </Button>
                              <Button color="error" size="small" onClick={() => handleDeleteTech(tech._id)}>
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 2 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Cong cu</Typography>
                    <Button variant="contained" size="small" onClick={openAddTool}>
                      Them cong cu
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ten</TableCell>
                        <TableCell>Loai</TableCell>
                        <TableCell>So luong kha dung</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tools.map((tool) => (
                        <TableRow key={tool._id}>
                          <TableCell>{tool.name}</TableCell>
                          <TableCell>{tool.typeCode}</TableCell>
                          <TableCell>{tool.availableQty}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditTool(tool)}>
                                Chinh sua
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteTool(tool._id)}>
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Cong cu phan mem</Typography>
                    <Button variant="contained" size="small" onClick={openAddLicense}>
                      Them cong cu phan mem
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ten</TableCell>
                        <TableCell>Loai</TableCell>
                        <TableCell>Han muc</TableCell>
                        <TableCell>Dang su dung</TableCell>
                        <TableCell>Kha dung</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {licenses.map((lic) => (
                        <TableRow key={lic._id}>
                          <TableCell>{lic.name}</TableCell>
                          <TableCell>{lic.typeCode}</TableCell>
                          <TableCell>{lic.capTotal}</TableCell>
                          <TableCell>{lic.inUseNow}</TableCell>
                          <TableCell>{lic.capTotal - lic.inUseNow}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditLicense(lic)}>
                                Chinh sua
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteLicense(lic._id)}>
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Phuong tien</Typography>
                    <Button variant="contained" size="small" onClick={openAddVehicle}>
                      Them phuong tien
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nguon</TableCell>
                        <TableCell>So luong kha dung</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vehicles.map((veh) => (
                        <TableRow key={veh._id}>
                          <TableCell>Nguon phuong tien</TableCell>
                          <TableCell>{veh.availableQty}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditVehicle(veh)}>
                                Chinh sua
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteVehicle(veh._id)}>
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 3 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Ky nang</Typography>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setSkillDialogMode('add')
                        setEditingSkillId(null)
                        setSkillForm({ name: '' })
                        setSkillDialogOpen(true)
                      }}
                    >
                      Them ky nang
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ten</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {skills.map((skill) => (
                        <TableRow key={skill._id}>
                          <TableCell>{skill.name}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                onClick={() => {
                                  setSkillDialogMode('edit')
                                  setEditingSkillId(skill._id)
                                  setSkillForm({ name: skill.name })
                                  setSkillDialogOpen(true)
                                }}
                              >
                                Chinh sua
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={async () => {
                                  await api.delete(`/api/skills/${skill._id}`)
                                  await load()
                                }}
                              >
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 4 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Loai su co</Typography>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setIncidentTypeDialogMode('add')
                        setEditingIncidentTypeId(null)
                        setIncidentTypeForm({
                          code: '',
                          name: '',
                          defaultPriority: 3,
                          defaultSetupRemote: 0.5,
                          defaultFeasRemote: true,
                          defaultFeasOnsite: true,
                          requiredSkills: [],
                          toolsR: '',
                          toolsO: '',
                          licensesR: '',
                          licensesO: '',
                          requiresVehicleIfOnsite: false
                        })
                        setIncidentTypeDialogOpen(true)
                      }}
                    >
                      Them loai
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Ma</TableCell>
                        <TableCell>Ten</TableCell>
                        <TableCell>Do uu tien</TableCell>
                        <TableCell>Kha thi tu xa</TableCell>
                        <TableCell>Kha thi tai cho</TableCell>
                        <TableCell>Thao tac</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {incidentTypes.map((type) => (
                        <TableRow key={type._id}>
                          <TableCell>{type.code}</TableCell>
                          <TableCell>{type.name}</TableCell>
                          <TableCell>{type.defaultPriority}</TableCell>
                          <TableCell>{type.defaultFeasRemote ? 'Co' : 'Khong'}</TableCell>
                          <TableCell>{type.defaultFeasOnsite ? 'Co' : 'Khong'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                onClick={() => {
                                  setIncidentTypeDialogMode('edit')
                                  setEditingIncidentTypeId(type._id)
                                  setIncidentTypeForm({
                                    code: type.code,
                                    name: type.name,
                                    defaultPriority: type.defaultPriority,
                                    defaultSetupRemote: type.defaultSetupRemote,
                                    defaultFeasRemote: type.defaultFeasRemote,
                                    defaultFeasOnsite: type.defaultFeasOnsite,
                                    requiredSkills: type.requirements?.requiredSkills || [],
                                    toolsR: type.requirements?.requiredToolsByMode?.R?.join(', ') || '',
                                    toolsO: type.requirements?.requiredToolsByMode?.O?.join(', ') || '',
                                    licensesR: type.requirements?.requiredLicensesByMode?.R?.join(', ') || '',
                                    licensesO: type.requirements?.requiredLicensesByMode?.O?.join(', ') || '',
                                    requiresVehicleIfOnsite: Boolean(type.requirements?.requiresVehicleIfOnsite)
                                  })
                                  setIncidentTypeDialogOpen(true)
                                }}
                              >
                                Chinh sua
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={async () => {
                                  await api.delete(`/api/incident-types/${type._id}`)
                                  await load()
                                }}
                              >
                                Xoa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={unitDialogOpen} onClose={closeUnitDialog} fullWidth maxWidth="sm">
        <DialogTitle>{unitDialogMode === 'add' ? 'Them don vi' : 'Chinh sua don vi'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Ten"
              value={unitForm.name}
              onChange={(e) => setUnitForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Dia chi"
              value={unitForm.address}
              onChange={(e) => setUnitForm((prev) => ({ ...prev, address: e.target.value }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Vi do"
                value={unitForm.lat}
                onChange={(e) => setUnitForm((prev) => ({ ...prev, lat: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Kinh do"
                value={unitForm.lng}
                onChange={(e) => setUnitForm((prev) => ({ ...prev, lng: e.target.value }))}
                fullWidth
              />
            </Stack>
            <UnitLocationPicker
              lat={unitForm.lat === '' ? null : Number(unitForm.lat)}
              lng={unitForm.lng === '' ? null : Number(unitForm.lng)}
              onChange={(lat, lng) =>
                setUnitForm((prev) => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }))
              }
              storageKey={unitLocationPickerKey}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={unitForm.remoteAccessReady}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, remoteAccessReady: e.target.checked }))}
                />
              }
              label="San sang truy cap tu xa"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={unitForm.isSupportStation}
                  onChange={(e) => setUnitForm((prev) => ({ ...prev, isSupportStation: e.target.checked }))}
                  disabled={stationLocked && !unitForm.isSupportStation}
                />
              }
              label="Tram ho tro"
            />
            {stationLocked && !unitForm.isSupportStation && (
              <Typography variant="caption" color="text.secondary">
                Tram ho tro da duoc thiet lap la {existingStation?.name}.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitUnit}>
                Luu
              </Button>
              <Button onClick={closeUnitDialog}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteUnitDialogOpen} onClose={closeDeleteUnitDialog} fullWidth maxWidth="xs">
        <DialogTitle>Xac nhan xoa don vi</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography>
              Ban co chac chan muon xoa don vi <strong>{deleteUnitTarget?.name}</strong>?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hanh dong nay khong the hoan tac.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteUnitDialog}>Huy</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDeleteUnit}>
            Xoa
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={techDialogOpen} onClose={closeTechDialog} fullWidth maxWidth="md">
        <DialogTitle>{techDialogMode === 'add' ? 'Them ky thuat vien' : 'Chinh sua ky thuat vien'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Ten"
              value={techForm.name}
              onChange={(e) => setTechForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <Stack direction="row" spacing={1}>
              <TextField label="Vi do tram ho tro" value={stationLocation?.lat ?? ''} fullWidth disabled />
              <TextField label="Kinh do tram ho tro" value={stationLocation?.lng ?? ''} fullWidth disabled />
            </Stack>
            <TextField label="Dia chi tram ho tro" value={stationLocation?.address ?? ''} fullWidth disabled />
            {!stationReady && (
              <Typography variant="caption" color="error">
                Vui long thiet lap don vi tram ho tro truoc khi them ky thuat vien.
              </Typography>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={techForm.availableNow}
                  onChange={(e) => setTechForm((prev) => ({ ...prev, availableNow: e.target.checked }))}
                />
              }
              label="San sang hien tai"
            />
            <FormControl fullWidth>
              <InputLabel id="tech-skills-label">Ky nang</InputLabel>
              <Select
                labelId="tech-skills-label"
                multiple
                value={techForm.skills}
                label="Ky nang"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setTechForm((prev) => ({ ...prev, skills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={techForm.skills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="subtitle2">dMatrix (theo loai su co)</Typography>
            <Stack spacing={1}>
              {techForm.dMatrixRows.map((row, idx) => (
                <Stack direction="row" spacing={1} key={`${row.typeCode}-${idx}`}>
                  <TextField
                    select
                    label="Loai su co"
                    value={row.typeCode}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, typeCode: e.target.value } : r
                        )
                      }))
                    }
                    fullWidth
                  >
                    {incidentTypes.map((type) => (
                      <MenuItem key={type._id} value={type.code}>
                        {type.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Che do"
                    value={row.mode}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, mode: e.target.value as 'R' | 'O' } : r
                        )
                      }))
                    }
                    sx={{ width: 120 }}
                  >
                    <MenuItem value="R">Tu xa</MenuItem>
                    <MenuItem value="O">Tai cho</MenuItem>
                  </TextField>
                  <TextField
                    label="Thoi luong (gio)"
                    type="number"
                    value={row.durationHours}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, durationHours: e.target.value } : r
                        )
                      }))
                    }
                    sx={{ width: 150 }}
                  />
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.filter((_, rIdx) => rIdx !== idx)
                      }))
                    }
                  >
                    Loai bo
                  </Button>
                </Stack>
              ))}
              <Button
                size="small"
                onClick={() =>
                  setTechForm((prev) => ({
                    ...prev,
                    dMatrixRows: [...prev.dMatrixRows, { typeCode: '', mode: 'R', durationHours: '' }]
                  }))
                }
              >
                Them dong dMatrix
              </Button>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitTech} disabled={!stationReady}>
                Luu
              </Button>
              <Button onClick={closeTechDialog}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={toolDialogOpen} onClose={closeToolDialog} fullWidth maxWidth="sm">
        <DialogTitle>{toolDialogMode === 'add' ? 'Them cong cu' : 'Chinh sua cong cu'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Ten"
              value={toolForm.name}
              onChange={(e) => setToolForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Ma loai"
              value={toolForm.typeCode}
              onChange={(e) => setToolForm((prev) => ({ ...prev, typeCode: e.target.value }))}
              fullWidth
            />
            <TextField
              label="So luong kha dung"
              type="number"
              value={toolForm.availableQty}
              onChange={(e) => setToolForm((prev) => ({ ...prev, availableQty: Number(e.target.value) }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitTool}>
                Luu
              </Button>
              <Button onClick={closeToolDialog}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={licenseDialogOpen} onClose={closeLicenseDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {licenseDialogMode === 'add' ? 'Them cong cu phan mem' : 'Chinh sua cong cu phan mem'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Ten"
              value={licenseForm.name}
              onChange={(e) => setLicenseForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Ma loai"
              value={licenseForm.typeCode}
              onChange={(e) => setLicenseForm((prev) => ({ ...prev, typeCode: e.target.value }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Tong han muc"
                type="number"
                value={licenseForm.capTotal}
                onChange={(e) => setLicenseForm((prev) => ({ ...prev, capTotal: Number(e.target.value) }))}
                fullWidth
              />
              <TextField
                label="Dang su dung"
                type="number"
                value={licenseForm.inUseNow}
                onChange={(e) => setLicenseForm((prev) => ({ ...prev, inUseNow: Number(e.target.value) }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitLicense}>
                Luu
              </Button>
              <Button onClick={closeLicenseDialog}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={vehicleDialogOpen} onClose={closeVehicleDialog} fullWidth maxWidth="sm">
        <DialogTitle>{vehicleDialogMode === 'add' ? 'Them phuong tien' : 'Chinh sua phuong tien'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="So luong kha dung"
              type="number"
              value={vehicleForm.availableQty}
              onChange={(e) => setVehicleForm({ availableQty: Number(e.target.value) })}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitVehicle}>
                Luu
              </Button>
              <Button onClick={closeVehicleDialog}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={skillDialogOpen} onClose={() => setSkillDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{skillDialogMode === 'add' ? 'Them ky nang' : 'Chinh sua ky nang'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Ten ky nang"
              value={skillForm.name}
              onChange={(e) => setSkillForm({ name: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitSkill}>
                Luu
              </Button>
              <Button onClick={() => setSkillDialogOpen(false)}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={requirementsDialogOpen}
        onClose={() => setRequirementsDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Yeu cau su co</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="req-skills-label">Ky nang bat buoc</InputLabel>
              <Select
                labelId="req-skills-label"
                multiple
                value={requirementsForm.requiredSkills}
                label="Ky nang bat buoc"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setRequirementsForm((prev) => ({ ...prev, requiredSkills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={requirementsForm.requiredSkills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth>
                <InputLabel id="req-tools-r-label">Cong cu (tu xa)</InputLabel>
                <Select
                  labelId="req-tools-r-label"
                  multiple
                  value={requirementsForm.toolsR}
                  label="Cong cu (tu xa)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, toolsR: event.target.value as string[] }))
                  }
                >
                  {toolTypeOptions.map((tool) => (
                    <MenuItem key={tool.typeCode} value={tool.typeCode}>
                      <Checkbox checked={requirementsForm.toolsR.includes(tool.typeCode)} />
                      <ListItemText primary={`${tool.name} (${tool.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="req-tools-o-label">Cong cu (tai cho)</InputLabel>
                <Select
                  labelId="req-tools-o-label"
                  multiple
                  value={requirementsForm.toolsO}
                  label="Cong cu (tai cho)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, toolsO: event.target.value as string[] }))
                  }
                >
                  {toolTypeOptions.map((tool) => (
                    <MenuItem key={tool.typeCode} value={tool.typeCode}>
                      <Checkbox checked={requirementsForm.toolsO.includes(tool.typeCode)} />
                      <ListItemText primary={`${tool.name} (${tool.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth>
                <InputLabel id="req-licenses-r-label">Cong cu phan mem (tu xa)</InputLabel>
                <Select
                  labelId="req-licenses-r-label"
                  multiple
                  value={requirementsForm.licensesR}
                  label="Cong cu phan mem (tu xa)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, licensesR: event.target.value as string[] }))
                  }
                >
                  {licenseTypeOptions.map((lic) => (
                    <MenuItem key={lic.typeCode} value={lic.typeCode}>
                      <Checkbox checked={requirementsForm.licensesR.includes(lic.typeCode)} />
                      <ListItemText primary={`${lic.name} (${lic.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="req-licenses-o-label">Cong cu phan mem (tai cho)</InputLabel>
                <Select
                  labelId="req-licenses-o-label"
                  multiple
                  value={requirementsForm.licensesO}
                  label="Cong cu phan mem (tai cho)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, licensesO: event.target.value as string[] }))
                  }
                >
                  {licenseTypeOptions.map((lic) => (
                    <MenuItem key={lic.typeCode} value={lic.typeCode}>
                      <Checkbox checked={requirementsForm.licensesO.includes(lic.typeCode)} />
                      <ListItemText primary={`${lic.name} (${lic.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={requirementsForm.requiresVehicleIfOnsite}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, requiresVehicleIfOnsite: event.target.checked }))
                  }
                />
              }
              label="Yeu cau phuong tien khi tai cho"
            />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSaveRequirements}>
                Luu
              </Button>
              <Button onClick={() => setRequirementsDialogOpen(false)}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentTypeDialogOpen} onClose={() => setIncidentTypeDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {incidentTypeDialogMode === 'add' ? 'Them loai su co' : 'Chinh sua loai su co'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Ma"
                value={incidentTypeForm.code}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, code: e.target.value }))}
                fullWidth
                disabled={incidentTypeDialogMode === 'edit'}
              />
              <TextField
                label="Ten"
                value={incidentTypeForm.name}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Do uu tien mac dinh"
                type="number"
                value={incidentTypeForm.defaultPriority}
                onChange={(e) =>
                  setIncidentTypeForm((prev) => ({ ...prev, defaultPriority: Number(e.target.value) }))
                }
                fullWidth
              />
              <TextField
                label="Thoi gian thiet lap tu xa mac dinh (gio)"
                type="number"
                value={incidentTypeForm.defaultSetupRemote}
                onChange={(e) =>
                  setIncidentTypeForm((prev) => ({ ...prev, defaultSetupRemote: Number(e.target.value) }))
                }
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={incidentTypeForm.defaultFeasRemote}
                    onChange={(e) =>
                      setIncidentTypeForm((prev) => ({ ...prev, defaultFeasRemote: e.target.checked }))
                    }
                  />
                }
                label="Kha thi tu xa"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={incidentTypeForm.defaultFeasOnsite}
                    onChange={(e) =>
                      setIncidentTypeForm((prev) => ({ ...prev, defaultFeasOnsite: e.target.checked }))
                    }
                  />
                }
                label="Kha thi tai cho"
              />
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="incident-required-skills-label">Ky nang bat buoc</InputLabel>
              <Select
                labelId="incident-required-skills-label"
                multiple
                value={incidentTypeForm.requiredSkills}
                label="Ky nang bat buoc"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setIncidentTypeForm((prev) => ({ ...prev, requiredSkills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={incidentTypeForm.requiredSkills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Cong cu (tu xa)"
                value={incidentTypeForm.toolsR}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, toolsR: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Cong cu (tai cho)"
                value={incidentTypeForm.toolsO}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, toolsO: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Cong cu phan mem (tu xa)"
                value={incidentTypeForm.licensesR}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, licensesR: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Cong cu phan mem (tai cho)"
                value={incidentTypeForm.licensesO}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, licensesO: e.target.value }))}
                fullWidth
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={incidentTypeForm.requiresVehicleIfOnsite}
                  onChange={(e) =>
                    setIncidentTypeForm((prev) => ({ ...prev, requiresVehicleIfOnsite: e.target.checked }))
                  }
                />
              }
              label="Yeu cau phuong tien khi tai cho"
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitIncidentType}>
                Luu
              </Button>
              <Button onClick={() => setIncidentTypeDialogOpen(false)}>Huy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onClose={() => setResult(null)} fullWidth maxWidth="md">
        <DialogTitle>Ket qua toi uu hoa</DialogTitle>
        <DialogContent>
          {result && (
            <Stack spacing={2}>
              <Typography variant="body2">
                Muc tieu: Z1={result.objectives.Z1}, Z2={result.objectives.Z2}, Z3={result.objectives.Z3}
              </Typography>
              <Typography variant="subtitle2">Su co da dieu phoi</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Su co</TableCell>
                      <TableCell>Ky thuat vien</TableCell>
                      <TableCell>Che do</TableCell>
                      <TableCell>Nguon luc</TableCell>
                      <TableCell>Thoi gian (gio)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.assignments.map((a) => (
                      <TableRow key={`${a.incidentId}-${a.technicianId}`}>
                        <TableCell>{a.incidentId}</TableCell>
                        <TableCell>{a.technicianId}</TableCell>
                        <TableCell>{a.mode}</TableCell>
                        <TableCell>
                          Cong cu: {a.allocatedTools.join(', ') || 'Khong co'} | Cong cu phan mem:{' '}
                          {a.allocatedLicenses.join(', ') || 'Khong co'}
                        </TableCell>
                        <TableCell>{a.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {result.assignments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Typography variant="caption" color="text.secondary">
                            Khong co su co nao duoc dieu phoi trong lan chay nay.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Typography variant="subtitle2">Chua duoc dieu phoi</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Su co</TableCell>
                      <TableCell>Do uu tien</TableCell>
                      <TableCell>Ly do</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(result.unassigned ?? []).map((entry) => (
                      <TableRow key={`unassigned-${entry.incidentId}`}>
                        <TableCell>{entry.typeCode || entry.incidentId}</TableCell>
                        <TableCell>{entry.priority}</TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            {entry.reasons.map((reason, idx) => (
                              <Typography key={`${entry.incidentId}-reason-${idx}`} variant="caption">
                                {reason}
                              </Typography>
                            ))}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(result.unassigned ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography variant="caption" color="text.secondary">
                            Tat ca cac su co ung vien deu da duoc dieu phoi.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" onClick={() => setResult(null)}>
                  Xac nhan
                </Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(unitAccessDialogUnit)}
        onClose={() => setUnitAccessDialogUnit(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Truy cap don vi: <b>{unitAccessDialogUnit?.name}</b>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Chon che do truy cap cho don vi nay:
            </Typography>
            {unitAccessDialogUnit?.location?.address && (
              <Typography variant="caption" color="text.secondary">
                Dia chi: {unitAccessDialogUnit.location.address}
              </Typography>
            )}
            {(unitAccessDialogUnit?.activeIncidents ?? 0) > 0 && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                Dang co {unitAccessDialogUnit?.activeIncidents} su co chua giai quyet
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 3, pb: 2.5 }}>
          <Button
            variant="contained"
            color="info"
            fullWidth
            onClick={() => handleConfirmUnitAccess('unit')}
          >
            Vao giao dien Don vi (Dien tap)
          </Button>
          <Button fullWidth onClick={() => setUnitAccessDialogUnit(null)}>
            Huy
          </Button>
        </DialogActions>
      </Dialog>

      {unitPortalUnit && (
        <UnitPortal
          unit={{ ...unitPortalUnit, _id: unitPortalUnit._id ?? (unitPortalUnit as any).id ?? '' }}
          companyId={user.companyId}
          onClose={() => {
            setUnitPortalUnit(null)
            load()
          }}
        />
      )}
    </Stack>
  )
}

export default CompanyPortal
