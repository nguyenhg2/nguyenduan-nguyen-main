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
      ? { center: [lat, lng] as [number, number], zoom: 14 }
      : { center: [21.028, 105.854] as [number, number], zoom: 12 }
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
  const typeNameByCode = useMemo(() => new Map(incidentTypes.map((t) => [t.code, t.name])), [incidentTypes])
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
  const companyUnitsMapInitial = loadMapState(companyUnitsMapKey, { center: [21.028, 105.854], zoom: 12 })

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
    if (status === 'DISPATCHED' || status === 'IN_PROGRESS' || status === 'DISPATCHING') return 'Đang điều phối'
    if (status === 'OPEN') return 'Mở'
    if (status === 'RESOLVED') return 'Hoàn tất'
    return status
  }
  const statusBuckets = [
    { key: 'OPEN', label: 'Mở', color: '#0277bd' },
    { key: 'DISPATCHING', label: 'Đang điều phối', color: '#f9a825' },
    { key: 'RESOLVED', label: 'Hoàn tất', color: '#2e7d32' }
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
    try {
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

    const fetchOneRoute = async (
      routerUrl: string,
      lng1: number,
      lat1: number,
      lng2: number,
      lat2: number,
      signal: AbortSignal
    ): Promise<[number, number][] | null> => {
      const url =
        `${routerUrl}/route/v1/driving/` +
        `${lng1},${lat1};${lng2},${lat2}` +
        `?overview=full&geometries=geojson`
      const res = await fetch(url, { signal })
      if (!res.ok) return null
      const data = await res.json()
      if (data.code !== 'Ok') return null
      const coords = data.routes?.[0]?.geometry?.coordinates
      if (!coords || coords.length < 2) return null
      return coords.map(([cLng, cLat]: [number, number]) => [cLat, cLng] as [number, number])
    }

    const fetchRoutes = async () => {
      const entries = await Promise.all(
        requests.map(async ({ incidentId, unit }) => {
          const lng1 = stationLocation.lng
          const lat1 = stationLocation.lat
          const lng2 = unit.location.lng
          const lat2 = unit.location.lat
          const straight: [number, number][] = [[lat1, lng1], [lat2, lng2]]

          let latlngs: [number, number][] | null = null

          if (ROUTER_BASE_URL.includes('localhost') || ROUTER_BASE_URL.includes('127.0.0.1')) {
            try {
              latlngs = await fetchOneRoute(ROUTER_BASE_URL, lng1, lat1, lng2, lat2, controller.signal)
            } catch {}
            if (!latlngs) {
              try {
                latlngs = await fetchOneRoute('https://router.project-osrm.org', lng1, lat1, lng2, lat2, controller.signal)
              } catch {}
            }
          } else {
            try {
              latlngs = await fetchOneRoute(ROUTER_BASE_URL, lng1, lat1, lng2, lat2, controller.signal)
            } catch {}
          }

          return [incidentId, latlngs || straight] as const
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
      <Typography variant="h5">Bảng điều khiển doanh nghiệp</Typography>
      <Tabs value={mainTab} onChange={(_, value) => setMainTab(value)}>
        <Tab label="Điều phối" />
        <Tab label="Quản trị" />
      </Tabs>

      {mainTab === 0 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Sự cố đang xử lý</Typography>
                <Typography variant="caption" color="text.secondary">
                  Hiển thị {Math.min(activeIncidents.length, incidentRowsPerPage)} trên {activeIncidents.length}
                </Typography>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Loại sự cố</TableCell>
                    <TableCell>Thành phần</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Độ ưu tiên</TableCell>
                    <TableCell>Đơn vị</TableCell>
                    <TableCell>Tính khả thi (chế độ)</TableCell>
                    <TableCell>Thời điểm báo cáo</TableCell>
                    <TableCell>Yêu cầu</TableCell>
                    <TableCell>Thao tác</TableCell>
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
                          <TableCell>{typeNameByCode.get(inc.typeCode) ?? inc.typeCode}</TableCell>
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
                                label="TX"
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
                                label="TC"
                              />
                            </Stack>
                          </TableCell>
                          <TableCell>{new Date(inc.reportedAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Kỹ năng: {inc.requirements?.requiredSkills?.length ?? 0} | Công cụ (TX/TC):
                              {inc.requirements?.requiredToolsByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredToolsByMode?.O?.length ?? 0} | Phần mềm (TX/TC):
                              {inc.requirements?.requiredLicensesByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredLicensesByMode?.O?.length ?? 0} | Phương tiện:
                              {inc.requirements?.requiresVehicleIfOnsite ? 'Có' : 'Không'}
                            </Typography>
                            <Button size="small" onClick={() => openRequirementsDialog(inc)}>
                              Chỉnh sửa
                            </Button>
                          </TableCell>
                          <TableCell>
                            {isEditable ? (
                              <Button size="small" onClick={() => handleSaveIncidentConfig(inc._id)}>
                                Lưu
                              </Button>
                            ) : (
                              (inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                                <Button size="small" color="warning" onClick={() => handleCancelDispatch(inc._id)}>
                                  Huỷ điều phối
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
                                  Nguồn lực đã điều phối
                                </Typography>
                                {inc.dispatch ? (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Kỹ thuật viên</TableCell>
                                        <TableCell>Chế độ</TableCell>
                                        <TableCell>Công cụ</TableCell>
                                        <TableCell>Phần mềm</TableCell>
                                        <TableCell>Phương tiện</TableCell>
                                        <TableCell>Thời gian ước tính (giờ)</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      <TableRow>
                                        <TableCell>
                                          {techNameById.get(inc.dispatch.assignedTechId) || inc.dispatch.assignedTechId}
                                        </TableCell>
                                        <TableCell>{inc.dispatch.mode === 'R' ? 'Từ xa' : 'Tại chỗ'}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedTools.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedLicenses.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{inc.dispatch.vehicleAllocated ? 'Có' : 'Không'}</TableCell>
                                        <TableCell>{inc.dispatch.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Chưa có điều phối nào được gán.
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
                      Nguồn lực
                    </Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Danh mục</TableCell>
                            <TableCell>Tên</TableCell>
                            <TableCell>Mã</TableCell>
                            <TableCell align="right">Khả dụng</TableCell>
                            <TableCell align="right">Tổng</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>Kỹ thuật viên</TableCell>
                            <TableCell>KTV sẵn sàng</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{availableTechs}</TableCell>
                            <TableCell align="right">{technicians.length}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Phương tiện</TableCell>
                            <TableCell>Nguồn phương tiện</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                          </TableRow>
                          {tools.map((tool) => (
                            <TableRow key={tool._id}>
                              <TableCell>Công cụ</TableCell>
                              <TableCell>{tool.name}</TableCell>
                              <TableCell>{tool.typeCode}</TableCell>
                              <TableCell align="right">{tool.availableQty}</TableCell>
                              <TableCell align="right">-</TableCell>
                            </TableRow>
                          ))}
                          {licenses.map((lic) => (
                            <TableRow key={lic._id}>
                              <TableCell>Phần mềm</TableCell>
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
                      Tối ưu điều phối ngay
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Thống kê sự cố
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
                      Các loại sự cố nổi bật
                    </Typography>
                    <Stack spacing={1.5}>
                      {typeData.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Chưa ghi nhận sự cố.
                        </Typography>
                      )}
                      {typeData.map(([typeCode, count]) => (
                        <Box key={typeCode} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ width: 110 }} title={typeCode}>
                            {(typeNameByCode.get(typeCode) ?? typeCode).slice(0, 18)}
                          </Typography>
                          <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                            <Box
                              sx={{
                                width: `${(count / maxTypeCount) * 100}%`,
                                height: '100%',
                                backgroundColor: '#5c6bc0',
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
              <Card sx={{ height: '100%', minHeight: 480 }}>
                <CardContent sx={{ height: '100%', p: '0 !important' }}>
                  <MapContainer
                    center={companyUnitsMapInitial.center}
                    zoom={companyUnitsMapInitial.zoom}
                    style={{ height: '100%', width: '100%', minHeight: 480 }}
                  >
                    <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
                    <MapStatePersistence storageKey={companyUnitsMapKey} />
                    {units.map((unit) => (
                      <Marker
                        key={unit._id}
                        position={[unit.location.lat, unit.location.lng]}
                        icon={unit.isSupportStation ? supportStationIcon : DefaultIcon}
                        eventHandlers={{ click: () => handleUnitMarkerClick(unit) }}
                      >
                        <Tooltip direction="top" offset={[0, -20]} permanent={false}>
                          {unit.name}
                          {unit.isSupportStation ? ' (Tram ung cuu)' : ''}
                        </Tooltip>
                      </Marker>
                    ))}
                    {activeIncidents
                      .filter((inc) => {
                        const unit = unitById.get(inc.unitId)
                        return unit?.location
                      })
                      .map((inc) => {
                        const unit = unitById.get(inc.unitId)!
                        return (
                          <Marker
                            key={`pulse-${inc._id}`}
                            position={[unit.location.lat, unit.location.lng]}
                            icon={pulseIcon}
                          >
                              <Popup>
                              <strong>{typeNameByCode.get(inc.typeCode) ?? inc.typeCode}</strong>
                              <br />
                              {unitNameById.get(inc.unitId)} - {statusLabel(inc.status)}
                            </Popup>
                          </Marker>
                        )
                      })}
                    {dispatchedIncidents.map((inc) => {
                      const unit = unitById.get(inc.unitId)
                      if (!unit?.location || !stationLocation) return null
                      const isOnsite = inc.dispatch?.mode === 'O'
                      const lineColor = isOnsite ? '#d32f2f' : '#1976d2'
                      const dashArray = isOnsite ? undefined : '10 6'
                      const points = routeLines[inc._id] || [
                        [stationLocation.lat, stationLocation.lng],
                        [unit.location.lat, unit.location.lng]
                      ]
                      const techName = inc.dispatch?.assignedTechId
                        ? techNameById.get(inc.dispatch.assignedTechId) || inc.dispatch.assignedTechId
                        : ''
                      return (
                        <Polyline
                          key={`route-${inc._id}`}
                          positions={points}
                          pathOptions={{ color: lineColor, weight: 4, dashArray }}
                        >
                          <Tooltip sticky>
                            {typeNameByCode.get(inc.typeCode) ?? inc.typeCode} - {unitNameById.get(inc.unitId)}
                            {techName ? ` | KTV: ${techName}` : ''}
                            {` | ${isOnsite ? 'Tại chỗ' : 'Từ xa'}`}
                          </Tooltip>
                        </Polyline>
                      )
                    })}
                  </MapContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {result && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Kết quả tối ưu hoá điều phối
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Z1 (Tổng ưu tiên): {result.objectives.Z1} | Z2 (Thời gian phục hồi): {result.objectives.Z2} | Z3 (Chi phí di chuyển): {result.objectives.Z3}
                </Alert>
                {result.assignments.length > 0 && (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Sự cố</TableCell>
                        <TableCell>Kỹ thuật viên</TableCell>
                        <TableCell>Chế độ</TableCell>
                        <TableCell>Công cụ</TableCell>
                        <TableCell>Phần mềm</TableCell>
                        <TableCell>Xe</TableCell>
                        <TableCell>TG phục hồi (giờ)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.assignments.map((a, idx) => {
                        const inc = incidentById.get(a.incidentId)
                        return (
                          <TableRow key={idx}>
                            <TableCell>{inc ? (typeNameByCode.get(inc.typeCode) ?? inc.typeCode) : a.incidentId}</TableCell>
                            <TableCell>{techNameById.get(a.technicianId) || a.technicianId}</TableCell>
                            <TableCell>{a.mode === 'R' ? 'Từ xa' : 'Tại chỗ'}</TableCell>
                            <TableCell>{a.allocatedTools.join(', ') || '-'}</TableCell>
                            <TableCell>{a.allocatedLicenses.join(', ') || '-'}</TableCell>
                            <TableCell>{a.vehicleAllocated ? 'Có' : 'Không'}</TableCell>
                            <TableCell>{a.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                {result.unassigned.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="error">
                      Không thể điều phối:
                    </Typography>
                    {result.unassigned.map((u, idx) => (
                      <Typography key={idx} variant="caption" display="block">
                        {typeNameByCode.get(u.typeCode) ?? u.typeCode} (ưu tiên {u.priority}): {u.reasons.join('; ')}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {dispatchRuns.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Lịch sử điều phối
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell />
                      <TableCell>Thời gian</TableCell>
                      <TableCell>Số sự cố</TableCell>
                      <TableCell>Z1</TableCell>
                      <TableCell>Z2</TableCell>
                      <TableCell>Z3</TableCell>
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
                          <TableCell>{run.incidentIds.length}</TableCell>
                          <TableCell>{run.result.objectives.Z1}</TableCell>
                          <TableCell>{run.result.objectives.Z2}</TableCell>
                          <TableCell>{run.result.objectives.Z3}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={6} sx={{ py: 0 }}>
                            <Collapse in={expandedRuns[run._id]} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2 }}>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Sự cố</TableCell>
                                      <TableCell>Kỹ thuật viên</TableCell>
                                      <TableCell>Chế độ</TableCell>
                                      <TableCell>TG (giờ)</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {run.result.assignments.map((a, idx) => {
                                      const inc = incidentById.get(a.incidentId)
                                      return (
                                        <TableRow key={idx}>
                                          <TableCell>{inc ? (typeNameByCode.get(inc.typeCode) ?? inc.typeCode) : a.incidentId}</TableCell>
                                          <TableCell>{techNameById.get(a.technicianId) || a.technicianId}</TableCell>
                                          <TableCell>{a.mode === 'R' ? 'Từ xa' : 'Tại chỗ'}</TableCell>
                                          <TableCell>{a.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
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
          )}
        </Stack>
      )}

      {mainTab === 1 && (
        <Stack spacing={3}>
          <Tabs value={manageTab} onChange={(_, v) => setManageTab(v)}>
            <Tab label="Đơn vị" />
            <Tab label="Kỹ thuật viên" />
            <Tab label="Công cụ" />
            <Tab label="Phần mềm" />
            <Tab label="Phương tiện" />
            <Tab label="Kỹ năng" />
            <Tab label="Loại sự cố" />
          </Tabs>

          {manageTab === 0 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Đơn vị</Typography>
                  <Button variant="contained" size="small" onClick={openAddUnit}>Thêm đơn vị</Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Địa chỉ</TableCell>
                      <TableCell>Lat</TableCell>
                      <TableCell>Lng</TableCell>
                      <TableCell>Từ xa</TableCell>
                      <TableCell>Trạm ứng cứu</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {units.map((unit) => (
                      <TableRow key={unit._id}>
                        <TableCell>{unit.name}</TableCell>
                        <TableCell>{unit.location?.address}</TableCell>
                        <TableCell>{unit.location?.lat}</TableCell>
                        <TableCell>{unit.location?.lng}</TableCell>
                        <TableCell>{unit.remoteAccessReady ? 'Có' : 'Không'}</TableCell>
                        <TableCell>{unit.isSupportStation ? 'Có' : 'Không'}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => openEditUnit(unit)}>Sửa</Button>
                          <Button size="small" color="error" onClick={() => openDeleteUnitDialog(unit)}>Xoá</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 1 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Kỹ thuật viên</Typography>
                  <Button variant="contained" size="small" onClick={openAddTech} disabled={!stationReady}>
                    Thêm KTV
                  </Button>
                </Stack>
                {!stationReady && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Cần tạo trạm ứng cứu trước khi thêm kỹ thuật viên.
                  </Alert>
                )}
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Kỹ năng</TableCell>
                      <TableCell>Sẵn sàng</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {technicians.map((tech) => (
                      <TableRow key={tech._id}>
                        <TableCell>{tech.name}</TableCell>
                        <TableCell>{tech.skills.join(', ')}</TableCell>
                        <TableCell>{tech.availableNow ? 'Có' : 'Không'}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => openEditTech(tech)}>Sửa</Button>
                          <Button size="small" color="error" onClick={() => handleDeleteTech(tech._id)}>Xoá</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 2 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Công cụ</Typography>
                  <Button variant="contained" size="small" onClick={openAddTool}>Thêm công cụ</Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Mã</TableCell>
                      <TableCell>Số lượng</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tools.map((tool) => (
                      <TableRow key={tool._id}>
                        <TableCell>{tool.name}</TableCell>
                        <TableCell>{tool.typeCode}</TableCell>
                        <TableCell>{tool.availableQty}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => openEditTool(tool)}>Sửa</Button>
                          <Button size="small" color="error" onClick={() => handleDeleteTool(tool._id)}>Xoá</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 3 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Phần mềm / Bản quyền</Typography>
                  <Button variant="contained" size="small" onClick={openAddLicense}>Thêm phần mềm</Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Mã</TableCell>
                      <TableCell>Tổng</TableCell>
                      <TableCell>Đang dùng</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {licenses.map((lic) => (
                      <TableRow key={lic._id}>
                        <TableCell>{lic.name}</TableCell>
                        <TableCell>{lic.typeCode}</TableCell>
                        <TableCell>{lic.capTotal}</TableCell>
                        <TableCell>{lic.inUseNow}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => openEditLicense(lic)}>Sửa</Button>
                          <Button size="small" color="error" onClick={() => handleDeleteLicense(lic._id)}>Xoá</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 4 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Phương tiện</Typography>
                  <Button variant="contained" size="small" onClick={openAddVehicle}>Thêm xe</Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Số lượng khả dụng</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {vehicles.map((v) => (
                      <TableRow key={v._id}>
                        <TableCell>{v.availableQty}</TableCell>
                        <TableCell>
                          <Button size="small" onClick={() => openEditVehicle(v)}>Sửa</Button>
                          <Button size="small" color="error" onClick={() => handleDeleteVehicle(v._id)}>Xoá</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 5 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Kỹ năng</Typography>
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
                    Thêm kỹ năng
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {skills.map((s) => (
                      <TableRow key={s._id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            onClick={() => {
                              setSkillDialogMode('edit')
                              setEditingSkillId(s._id)
                              setSkillForm({ name: s.name })
                              setSkillDialogOpen(true)
                            }}
                          >
                            Sửa
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {manageTab === 6 && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Loại sự cố</Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      setIncidentTypeDialogMode('add')
                      setEditingIncidentTypeId(null)
                      setIncidentTypeForm({
                        code: '', name: '', defaultPriority: 3, defaultSetupRemote: 0.5,
                        defaultFeasRemote: true, defaultFeasOnsite: true, requiredSkills: [],
                        toolsR: '', toolsO: '', licensesR: '', licensesO: '', requiresVehicleIfOnsite: false
                      })
                      setIncidentTypeDialogOpen(true)
                    }}
                  >
                    Thêm loại sự cố
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã</TableCell>
                      <TableCell>Tên</TableCell>
                      <TableCell>Ưu tiên</TableCell>
                      <TableCell>Từ xa</TableCell>
                      <TableCell>Tại chỗ</TableCell>
                      <TableCell>Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {incidentTypes.map((it) => (
                      <TableRow key={it._id}>
                        <TableCell>{it.code}</TableCell>
                        <TableCell>{it.name}</TableCell>
                        <TableCell>{it.defaultPriority}</TableCell>
                        <TableCell>{it.defaultFeasRemote ? 'Có' : 'Không'}</TableCell>
                        <TableCell>{it.defaultFeasOnsite ? 'Có' : 'Không'}</TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            onClick={() => {
                              setIncidentTypeDialogMode('edit')
                              setEditingIncidentTypeId(it._id)
                              setIncidentTypeForm({
                                code: it.code,
                                name: it.name,
                                defaultPriority: it.defaultPriority,
                                defaultSetupRemote: it.defaultSetupRemote,
                                defaultFeasRemote: it.defaultFeasRemote,
                                defaultFeasOnsite: it.defaultFeasOnsite,
                                requiredSkills: it.requirements?.requiredSkills || [],
                                toolsR: it.requirements?.requiredToolsByMode?.R?.join(', ') || '',
                                toolsO: it.requirements?.requiredToolsByMode?.O?.join(', ') || '',
                                licensesR: it.requirements?.requiredLicensesByMode?.R?.join(', ') || '',
                                licensesO: it.requirements?.requiredLicensesByMode?.O?.join(', ') || '',
                                requiresVehicleIfOnsite: it.requirements?.requiresVehicleIfOnsite || false
                              })
                              setIncidentTypeDialogOpen(true)
                            }}
                          >
                            Sửa
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}

      {unitPortalUnit && (
        <Dialog open fullWidth maxWidth="lg" onClose={() => setUnitPortalUnit(null)}>
          <DialogTitle>{unitPortalUnit.name}</DialogTitle>
          <DialogContent>
            <UnitPortal
              unit={unitPortalUnit}
              companyId={user.companyId}
              onClose={() => setUnitPortalUnit(null)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUnitPortalUnit(null)}>Dong</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={Boolean(unitAccessDialogUnit)} onClose={() => setUnitAccessDialogUnit(null)}>
        <DialogTitle>Truy cập đơn vị</DialogTitle>
        <DialogContent>
          <Typography>
            Mở cổng đơn vị: {unitAccessDialogUnit?.name}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnitAccessDialogUnit(null)}>Huỷ</Button>
          <Button variant="contained" onClick={() => handleConfirmUnitAccess('unit')}>Mở cổng đơn vị</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={unitDialogOpen} onClose={closeUnitDialog} fullWidth maxWidth="md">
        <DialogTitle>{unitDialogMode === 'add' ? 'Thêm đơn vị' : 'Sửa đơn vị'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên đơn vị"
              value={unitForm.name}
              onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Địa chỉ"
              value={unitForm.address}
              onChange={(e) => setUnitForm((f) => ({ ...f, address: e.target.value }))}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                value={unitForm.lat}
                onChange={(e) => setUnitForm((f) => ({ ...f, lat: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Longitude"
                value={unitForm.lng}
                onChange={(e) => setUnitForm((f) => ({ ...f, lng: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Box sx={{ height: 300 }}>
              <UnitLocationPicker
                lat={unitForm.lat ? Number(unitForm.lat) : null}
                lng={unitForm.lng ? Number(unitForm.lng) : null}
                onChange={(lat, lng) => setUnitForm((f) => ({ ...f, lat: String(lat), lng: String(lng) }))}
                storageKey={unitLocationPickerKey}
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={unitForm.remoteAccessReady}
                  onChange={(e) => setUnitForm((f) => ({ ...f, remoteAccessReady: e.target.checked }))}
                />
              }
              label="Hỗ trợ truy cập từ xa"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={unitForm.isSupportStation}
                  onChange={(e) => setUnitForm((f) => ({ ...f, isSupportStation: e.target.checked }))}
                  disabled={stationLocked}
                />
              }
              label="Trạm ứng cứu"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUnitDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitUnit}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteUnitDialogOpen} onClose={closeDeleteUnitDialog}>
        <DialogTitle>Xoá đơn vị</DialogTitle>
        <DialogContent>
          <Typography>Bạn có chắc chắn muốn xoá đơn vị "{deleteUnitTarget?.name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteUnitDialog}>Huỷ</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDeleteUnit}>Xoá</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={techDialogOpen} onClose={closeTechDialog} fullWidth maxWidth="md">
        <DialogTitle>{techDialogMode === 'add' ? 'Thêm kỹ thuật viên' : 'Sửa kỹ thuật viên'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={techForm.name}
              onChange={(e) => setTechForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Kỹ năng</InputLabel>
              <Select
                multiple
                value={techForm.skills}
                onChange={(e) => setTechForm((f) => ({ ...f, skills: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {skills.map((s) => (
                  <MenuItem key={s._id} value={s.name}>
                    <Checkbox checked={techForm.skills.includes(s.name)} />
                    <ListItemText primary={s.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={techForm.availableNow}
                  onChange={(e) => setTechForm((f) => ({ ...f, availableNow: e.target.checked }))}
                />
              }
              label="Sẵn sàng"
            />
            <Typography variant="subtitle2">Ma trận thời gian xử lý</Typography>
            {techForm.dMatrixRows.map((row, idx) => (
              <Stack key={idx} direction="row" spacing={1} alignItems="center">
                <FormControl sx={{ minWidth: 160 }}>
                  <InputLabel>Loại sự cố</InputLabel>
                  <Select
                    value={row.typeCode}
                    onChange={(e) => {
                      const rows = [...techForm.dMatrixRows]
                      rows[idx] = { ...rows[idx], typeCode: e.target.value as string }
                      setTechForm((f) => ({ ...f, dMatrixRows: rows }))
                    }}
                  >
                    {incidentTypes.map((it) => (
                      <MenuItem key={it.code} value={it.code}>{it.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl sx={{ minWidth: 100 }}>
                  <InputLabel>Chế độ</InputLabel>
                  <Select
                    value={row.mode}
                    onChange={(e) => {
                      const rows = [...techForm.dMatrixRows]
                      rows[idx] = { ...rows[idx], mode: e.target.value as 'R' | 'O' }
                      setTechForm((f) => ({ ...f, dMatrixRows: rows }))
                    }}
                  >
                    <MenuItem value="R">Từ xa</MenuItem>
                    <MenuItem value="O">Tại chỗ</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Giờ"
                  type="number"
                  value={row.durationHours}
                  onChange={(e) => {
                    const rows = [...techForm.dMatrixRows]
                    rows[idx] = { ...rows[idx], durationHours: e.target.value }
                    setTechForm((f) => ({ ...f, dMatrixRows: rows }))
                  }}
                  sx={{ width: 100 }}
                />
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    const rows = techForm.dMatrixRows.filter((_, i) => i !== idx)
                    setTechForm((f) => ({ ...f, dMatrixRows: rows }))
                  }}
                >
                  Xoá
                </Button>
              </Stack>
            ))}
            <Button
              size="small"
              onClick={() =>
                setTechForm((f) => ({
                  ...f,
                  dMatrixRows: [...f.dMatrixRows, { typeCode: '', mode: 'R', durationHours: '' }]
                }))
              }
            >
              Thêm dòng
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTechDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitTech}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={toolDialogOpen} onClose={closeToolDialog} fullWidth maxWidth="sm">
        <DialogTitle>{toolDialogMode === 'add' ? 'Thêm công cụ' : 'Sửa công cụ'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={toolForm.name}
              onChange={(e) => setToolForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Mã loại"
              value={toolForm.typeCode}
              onChange={(e) => setToolForm((f) => ({ ...f, typeCode: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Số lượng"
              type="number"
              value={toolForm.availableQty}
              onChange={(e) => setToolForm((f) => ({ ...f, availableQty: Number(e.target.value) }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeToolDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitTool}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={licenseDialogOpen} onClose={closeLicenseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{licenseDialogMode === 'add' ? 'Thêm phần mềm' : 'Sửa phần mềm'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={licenseForm.name}
              onChange={(e) => setLicenseForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Mã loại"
              value={licenseForm.typeCode}
              onChange={(e) => setLicenseForm((f) => ({ ...f, typeCode: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Tổng cấp phép"
              type="number"
              value={licenseForm.capTotal}
              onChange={(e) => setLicenseForm((f) => ({ ...f, capTotal: Number(e.target.value) }))}
              fullWidth
            />
            <TextField
              label="Đang sử dụng"
              type="number"
              value={licenseForm.inUseNow}
              onChange={(e) => setLicenseForm((f) => ({ ...f, inUseNow: Number(e.target.value) }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeLicenseDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitLicense}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={vehicleDialogOpen} onClose={closeVehicleDialog} fullWidth maxWidth="sm">
        <DialogTitle>{vehicleDialogMode === 'add' ? 'Thêm phương tiện' : 'Sửa phương tiện'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Số lượng"
              type="number"
              value={vehicleForm.availableQty}
              onChange={(e) => setVehicleForm((f) => ({ ...f, availableQty: Number(e.target.value) }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeVehicleDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitVehicle}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={skillDialogOpen} onClose={() => setSkillDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{skillDialogMode === 'add' ? 'Thêm kỹ năng' : 'Sửa kỹ năng'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Tên kỹ năng"
            value={skillForm.name}
            onChange={(e) => setSkillForm({ name: e.target.value })}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkillDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitSkill}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={incidentTypeDialogOpen} onClose={() => setIncidentTypeDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{incidentTypeDialogMode === 'add' ? 'Thêm loại sự cố' : 'Sửa loại sự cố'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Mã"
              value={incidentTypeForm.code}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, code: e.target.value }))}
              fullWidth
              disabled={incidentTypeDialogMode === 'edit'}
            />
            <TextField
              label="Tên"
              value={incidentTypeForm.name}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Độ ưu tiên mặc định"
              type="number"
              value={incidentTypeForm.defaultPriority}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultPriority: Number(e.target.value) }))}
              fullWidth
            />
            <TextField
              label="Thời gian setup từ xa (giờ)"
              type="number"
              value={incidentTypeForm.defaultSetupRemote}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultSetupRemote: Number(e.target.value) }))}
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={incidentTypeForm.defaultFeasRemote}
                  onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultFeasRemote: e.target.checked }))}
                />
              }
              label="Khả thi từ xa"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={incidentTypeForm.defaultFeasOnsite}
                  onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultFeasOnsite: e.target.checked }))}
                />
              }
              label="Khả thi tại chỗ"
            />
            <FormControl fullWidth>
              <InputLabel>Kỹ năng yêu cầu</InputLabel>
              <Select
                multiple
                value={incidentTypeForm.requiredSkills}
                onChange={(e) => setIncidentTypeForm((f) => ({ ...f, requiredSkills: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {skills.map((s) => (
                  <MenuItem key={s._id} value={s.name}>
                    <Checkbox checked={incidentTypeForm.requiredSkills.includes(s.name)} />
                    <ListItemText primary={s.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Công cụ (TX) - phân cách dấu phẩy"
              value={incidentTypeForm.toolsR}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, toolsR: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Công cụ (TC) - phân cách dấu phẩy"
              value={incidentTypeForm.toolsO}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, toolsO: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Phần mềm (TX) - phân cách dấu phẩy"
              value={incidentTypeForm.licensesR}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, licensesR: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Phần mềm (TC) - phân cách dấu phẩy"
              value={incidentTypeForm.licensesO}
              onChange={(e) => setIncidentTypeForm((f) => ({ ...f, licensesO: e.target.value }))}
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={incidentTypeForm.requiresVehicleIfOnsite}
                  onChange={(e) => setIncidentTypeForm((f) => ({ ...f, requiresVehicleIfOnsite: e.target.checked }))}
                />
              }
              label="Cần phương tiện nếu tại chỗ"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIncidentTypeDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitIncidentType}>Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={requirementsDialogOpen} onClose={() => setRequirementsDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Yêu cầu sự cố</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Kỹ năng yêu cầu</InputLabel>
              <Select
                multiple
                value={requirementsForm.requiredSkills}
                onChange={(e) => setRequirementsForm((f) => ({ ...f, requiredSkills: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {skills.map((s) => (
                  <MenuItem key={s._id} value={s.name}>
                    <Checkbox checked={requirementsForm.requiredSkills.includes(s.name)} />
                    <ListItemText primary={s.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Công cụ (TX)</InputLabel>
              <Select
                multiple
                value={requirementsForm.toolsR}
                onChange={(e) => setRequirementsForm((f) => ({ ...f, toolsR: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {toolTypeOptions.map((opt) => (
                  <MenuItem key={opt.typeCode} value={opt.typeCode}>
                    <Checkbox checked={requirementsForm.toolsR.includes(opt.typeCode)} />
                    <ListItemText primary={opt.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Công cụ (TC)</InputLabel>
              <Select
                multiple
                value={requirementsForm.toolsO}
                onChange={(e) => setRequirementsForm((f) => ({ ...f, toolsO: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {toolTypeOptions.map((opt) => (
                  <MenuItem key={opt.typeCode} value={opt.typeCode}>
                    <Checkbox checked={requirementsForm.toolsO.includes(opt.typeCode)} />
                    <ListItemText primary={opt.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Phần mềm (TX)</InputLabel>
              <Select
                multiple
                value={requirementsForm.licensesR}
                onChange={(e) => setRequirementsForm((f) => ({ ...f, licensesR: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {licenseTypeOptions.map((opt) => (
                  <MenuItem key={opt.typeCode} value={opt.typeCode}>
                    <Checkbox checked={requirementsForm.licensesR.includes(opt.typeCode)} />
                    <ListItemText primary={opt.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Phần mềm (TC)</InputLabel>
              <Select
                multiple
                value={requirementsForm.licensesO}
                onChange={(e) => setRequirementsForm((f) => ({ ...f, licensesO: e.target.value as string[] }))}
                renderValue={(selected) => selected.join(', ')}
              >
                {licenseTypeOptions.map((opt) => (
                  <MenuItem key={opt.typeCode} value={opt.typeCode}>
                    <Checkbox checked={requirementsForm.licensesO.includes(opt.typeCode)} />
                    <ListItemText primary={opt.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={requirementsForm.requiresVehicleIfOnsite}
                  onChange={(e) => setRequirementsForm((f) => ({ ...f, requiresVehicleIfOnsite: e.target.checked }))}
                />
              }
              label="Cần phương tiện nếu tại chỗ"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequirementsDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSaveRequirements}>Lưu</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default CompanyPortal