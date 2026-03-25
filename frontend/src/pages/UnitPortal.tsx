import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography
} from '@mui/material'
import { Close, Refresh } from '@mui/icons-material'
import api from '../api'
import type { Component, Incident, IncidentType, Unit } from '../types'
import { getId, PRIORITY_LABEL } from '../types'

interface Props {
  unit: Unit
  companyId: string
  onClose: () => void
}

const STATUS_CHIP: Record<string, { label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = {
  OPEN:        { label: 'Mới báo cáo',  color: 'error' },
  DISPATCHED:  { label: 'Đã điều phối', color: 'warning' },
  IN_PROGRESS: { label: 'Đang xử lý',  color: 'info' },
  RESOLVED:    { label: 'Hoàn thành',  color: 'success' },
}

const EMPTY_COMP = {
  name: '', type: '', status: 'ACTIVE' as const,
  ipAddress: '', macAddress: '', serial: '',
  vendor: '', model: '', location: '',
  os: '', cpu: '', ramGB: '' as unknown as number, storageGB: '' as unknown as number,
  firmware: '',
  networkConfig: { subnet: '', gateway: '', vlan: '' },
  notes: '',
}

export default function UnitPortal({ unit, companyId, onClose }: Props) {
  const unitId = getId(unit)

  const [tab, setTab] = useState(0)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [selectedCompId, setSelectedCompId] = useState('')
  const [incNotes, setIncNotes] = useState('')

  const [openCompDialog, setOpenCompDialog] = useState(false)
  const [editingComp, setEditingComp] = useState<Partial<Component> & { _id?: string }>(EMPTY_COMP)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

 const load = async () => {
  if (!unitId) return;
  setLoading(true);
  setError(null);

  try {
    const typeRes = await api.get<IncidentType[]>('/api/incident-types');
    setIncidentTypes(typeRes.data);

    const compRes = await api.get<Component[]>(`/api/components?unitId=${unitId}`);

    const incRes = await api.get<Incident[]>(`/api/incidents?scope=company`);
    const unitIncidents = incRes.data.filter(inc => inc.unitId === unitId);

    setComponents(compRes.data);
    setIncidents(unitIncidents);
  } catch (err) {
    console.error('Load unit portal failed', err);
    setError('Không thể tải dữ liệu. Vui lòng thử lại sau.');
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    if (!unitId) { setLoading(false); return }
    load()
    timerRef.current = setInterval(load, 8000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [unitId])

  // Priority tự động lấy từ IncidentType.defaultPriority
  const selectedType = incidentTypes.find(t => getId(t) === selectedTypeId)
  const autoPriority = selectedType?.defaultPriority ?? null

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    try {
      await api.patch(`/api/incidents/${id}`, { status: 'RESOLVED' })
      await load()
    } finally {
      setResolvingId(null)
    }
  }

  const handleSubmitIncident = async () => {
    if (!selectedTypeId || !autoPriority) return
    setSubmitting(true)
    try {
      await api.post('/api/incidents', {
        unitId,
        companyId,
        typeCode: selectedType!.code,
        componentId: selectedCompId || undefined,
        priority: autoPriority,
        notes: incNotes,
         status: 'OPEN',
      })
      setSelectedTypeId('')
      setSelectedCompId('')
      setIncNotes('')
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenAddComp = () => {
    setEditingComp({ ...EMPTY_COMP })
    setOpenCompDialog(true)
  }

  const handleOpenEditComp = (comp: Component) => {
    setEditingComp({ ...comp })
    setOpenCompDialog(true)
  }

  const handleCloseCompDialog = () => {
    setOpenCompDialog(false)
    setEditingComp({ ...EMPTY_COMP })
  }

  const handleSubmitComp = async () => {
    const { _id, id, ...body } = editingComp as any
    const realId = _id ?? id
    const payload = { ...body, unitId, companyId }
    if (realId) {
      await api.patch(`/api/components/${realId}`, payload)
    } else {
      await api.post('/api/components', payload)
    }
    handleCloseCompDialog()
    await load()
  }

  const handleDeleteComp = async (comp: Component) => {
    const realId = getId(comp)
    if (!realId) return
    if (!window.confirm('Xác nhận xóa biên chế này?')) return
    await api.delete(`/api/components/${realId}`)
    await load()
  }

  const activeInc = incidents.filter(i => i.status !== 'RESOLVED')
  const resolvedInc = incidents.filter(i => i.status === 'RESOLVED')

  const getTypeName = (typeCode: string) =>
    incidentTypes.find(t => t.code === typeCode)?.name ?? typeCode

  // Portal dialog — render thẳng vào document.body
  const compDialog = ReactDOM.createPortal(
    <Dialog open={openCompDialog} onClose={handleCloseCompDialog} maxWidth="md" fullWidth>
      <DialogTitle>
        {(editingComp as any)._id ? 'Sửa biên chế' : 'Thêm biên chế mới'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Tên biên chế" required fullWidth size="small"
              value={editingComp.name ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Loại thiết bị" fullWidth size="small"
              value={editingComp.type ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, type: e.target.value }))}
            />
          </Stack>

          <FormControl fullWidth size="small">
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={editingComp.status ?? 'ACTIVE'}
              label="Trạng thái"
              onChange={e => setEditingComp(p => ({ ...p, status: e.target.value }))}
            >
              <MenuItem value="ACTIVE">Hoạt động</MenuItem>
              <MenuItem value="INACTIVE">Ngừng hoạt động</MenuItem>
              <MenuItem value="MAINTENANCE">Đang bảo trì</MenuItem>
            </Select>
          </FormControl>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">Thông tin mạng</Typography>
          </Divider>

          <Stack direction="row" spacing={2}>
            <TextField label="Địa chỉ IP" fullWidth size="small"
              value={editingComp.ipAddress ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, ipAddress: e.target.value }))} />
            <TextField label="Địa chỉ MAC" fullWidth size="small"
              value={editingComp.macAddress ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, macAddress: e.target.value }))} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Subnet Mask" fullWidth size="small"
              value={editingComp.networkConfig?.subnet ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, networkConfig: { ...p.networkConfig, subnet: e.target.value } }))} />
            <TextField label="Default Gateway" fullWidth size="small"
              value={editingComp.networkConfig?.gateway ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, networkConfig: { ...p.networkConfig, gateway: e.target.value } }))} />
            <TextField label="VLAN ID" fullWidth size="small"
              value={editingComp.networkConfig?.vlan ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, networkConfig: { ...p.networkConfig, vlan: e.target.value } }))} />
          </Stack>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">Thông tin phần cứng</Typography>
          </Divider>

          <Stack direction="row" spacing={2}>
            <TextField label="Nhà sản xuất" fullWidth size="small"
              value={editingComp.vendor ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, vendor: e.target.value }))} />
            <TextField label="Model" fullWidth size="small"
              value={editingComp.model ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, model: e.target.value }))} />
            <TextField label="Serial" fullWidth size="small"
              value={editingComp.serial ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, serial: e.target.value }))} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Hệ điều hành (OS)" fullWidth size="small"
              value={editingComp.os ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, os: e.target.value }))} />
            <TextField label="Firmware" fullWidth size="small"
              value={editingComp.firmware ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, firmware: e.target.value }))} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="CPU" fullWidth size="small"
              value={editingComp.cpu ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, cpu: e.target.value }))} />
            <TextField label="RAM (GB)" fullWidth size="small" type="number"
              value={editingComp.ramGB ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, ramGB: Number(e.target.value) || null }))} />
            <TextField label="Storage (GB)" fullWidth size="small" type="number"
              value={editingComp.storageGB ?? ''}
              onChange={e => setEditingComp(p => ({ ...p, storageGB: Number(e.target.value) || null }))} />
          </Stack>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">Khác</Typography>
          </Divider>

          <TextField label="Vị trí vật lý" fullWidth size="small"
            value={editingComp.location ?? ''}
            onChange={e => setEditingComp(p => ({ ...p, location: e.target.value }))} />
          <TextField label="Ghi chú" fullWidth size="small" multiline rows={2}
            value={editingComp.notes ?? ''}
            onChange={e => setEditingComp(p => ({ ...p, notes: e.target.value }))} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCloseCompDialog}>Huỷ</Button>
        <Button variant="contained" onClick={handleSubmitComp} disabled={!editingComp.name}>
          {(editingComp as any)._id ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </DialogActions>
    </Dialog>,
    document.body
  )

  return (
    <>
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 1500,
        bgcolor: 'background.default', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <Paper elevation={3} square sx={{
          px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2,
          bgcolor: 'primary.main', color: 'white'
        }}>
          <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>
            {unit.name}
            {unit.location?.address && (
              <Typography component="span" variant="caption" sx={{ ml: 1.5, opacity: 0.85 }}>
                {unit.location.address}
              </Typography>
            )}
          </Typography>
          {activeInc.length > 0 && (
            <Chip label={`${activeInc.length} sự cố đang mở`} color="error" size="small" />
          )}
          {unit.remoteAccessReady && (
            <Chip label="Hỗ trợ từ xa" color="info" size="small" />
          )}
          <IconButton onClick={load} size="small" sx={{ color: 'white' }}>
            <Refresh fontSize="small" />
          </IconButton>
          <IconButton onClick={onClose} size="small" sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </Paper>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Báo cáo sự cố" />
            <Tab label="Biên chế" />
            <Tab label="Lịch sử" />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" pt={8}>
              <CircularProgress />
            </Box>
          ) : !unitId ? (
            <Alert severity="error">Không xác định được ID đơn vị. Vui lòng đóng và mở lại.</Alert>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {tab === 0 && (
                <Stack spacing={3} maxWidth={700}>
                  <Paper variant="outlined" sx={{ p: 2.5 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Báo cáo sự cố mới
                    </Typography>
                    <Stack spacing={2}>
                      <FormControl fullWidth size="small" required>
                        <InputLabel>Loại sự cố</InputLabel>
                        <Select
                          value={selectedTypeId}
                          label="Loại sự cố"
                          onChange={e => { setSelectedTypeId(e.target.value); setSelectedCompId('') }}
                        >
                          {incidentTypes.length === 0 ? (
                            <MenuItem disabled>Không có loại sự cố</MenuItem>
                          ) : (
                            incidentTypes.map(t => (
                              <MenuItem key={getId(t)} value={getId(t)}>
                                {t.name}
                              </MenuItem>
                            ))
                          )}
                        </Select>
                      </FormControl>

                      {autoPriority !== null && (
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2" color="text.secondary">
                            Mức độ ưu tiên tự động:
                          </Typography>
                          <Chip
                            label={PRIORITY_LABEL[autoPriority]?.label ?? `P${autoPriority}`}
                            color={PRIORITY_LABEL[autoPriority]?.color ?? 'default'}
                            size="small"
                          />
                          <Typography variant="caption" color="text.secondary">
                            (xác định theo loại sự cố)
                          </Typography>
                        </Stack>
                      )}

                      <FormControl fullWidth size="small">
                        <InputLabel>Biên chế liên quan (tuỳ chọn)</InputLabel>
                        <Select
                          value={selectedCompId}
                          label="Biên chế liên quan (tuỳ chọn)"
                          onChange={e => setSelectedCompId(e.target.value)}
                        >
                          <MenuItem value="">-- Không chọn --</MenuItem>
                          {components.map(c => (
                            <MenuItem key={getId(c)} value={getId(c)}>
                              {c.name} ({c.type})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <TextField
                        label="Mô tả / Ghi chú"
                        multiline rows={3} size="small" fullWidth
                        value={incNotes}
                        onChange={e => setIncNotes(e.target.value)}
                      />

                      <Button
                        variant="contained" color="error" size="large"
                        disabled={!selectedTypeId || submitting}
                        onClick={handleSubmitIncident}
                      >
                        {submitting ? 'Đang gửi...' : 'Gửi báo cáo sự cố'}
                      </Button>
                    </Stack>
                  </Paper>

                  {activeInc.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Sự cố đang xử lý ({activeInc.length})
                      </Typography>
                      <Stack spacing={1}>
                        {activeInc.map(inc => (
                          <Paper key={inc._id} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                              <Stack spacing={0.5}>
                                <Typography variant="body2" fontWeight="bold">
                                  {getTypeName(inc.typeCode)}
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                  <Chip
                                    label={PRIORITY_LABEL[inc.priority]?.label ?? `P${inc.priority}`}
                                    color={PRIORITY_LABEL[inc.priority]?.color ?? 'default'}
                                    size="small"
                                  />
                                  <Chip
                                    label={STATUS_CHIP[inc.status]?.label ?? inc.status}
                                    color={STATUS_CHIP[inc.status]?.color ?? 'default'}
                                    size="small"
                                  />
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(inc.reportedAt).toLocaleString('vi-VN')}
                                </Typography>
                              </Stack>
                              {(inc.status === 'OPEN' || inc.status === 'IN_PROGRESS') && (
                                <Button
                                  size="small" variant="outlined" color="success"
                                  disabled={resolvingId === inc._id}
                                  onClick={() => handleResolve(inc._id)}
                                >
                                  {resolvingId === inc._id ? '...' : 'Đã xử lý xong'}
                                </Button>
                              )}
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  )}

                  {activeInc.length === 0 && !error && (
                    <Alert severity="success">Đơn vị không có sự cố đang xử lý.</Alert>
                  )}
                </Stack>
              )}

              {tab === 1 && (
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="bold">
                      Danh sách biên chế ({components.length})
                    </Typography>
                    <Button variant="contained" size="small" onClick={handleOpenAddComp}>
                      Thêm biên chế
                    </Button>
                  </Stack>

                  {components.length === 0 ? (
                    <Alert severity="info">
                      Chưa có biên chế nào. Nhấn "Thêm biên chế" để thêm mới.
                    </Alert>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Tên</TableCell>
                          <TableCell>Loại</TableCell>
                          <TableCell>Trạng thái</TableCell>
                          <TableCell>IP</TableCell>
                          <TableCell>Model</TableCell>
                          <TableCell>Vị trí</TableCell>
                          <TableCell align="right">Thao tác</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {components.map(c => (
                          <TableRow key={getId(c)}>
                            <TableCell>{c.name}</TableCell>
                            <TableCell>{c.type}</TableCell>
                            <TableCell>
                              <Chip
                                label={
                                  c.status === 'ACTIVE' ? 'Hoạt động'
                                  : c.status === 'INACTIVE' ? 'Ngừng'
                                  : 'Bảo trì'
                                }
                                color={
                                  c.status === 'ACTIVE' ? 'success'
                                  : c.status === 'INACTIVE' ? 'default'
                                  : 'warning'
                                }
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{c.ipAddress || '-'}</TableCell>
                            <TableCell>{c.model || '-'}</TableCell>
                            <TableCell>{c.location || '-'}</TableCell>
                            <TableCell align="right">
                              <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                <Button size="small" onClick={() => handleOpenEditComp(c)}>Sửa</Button>
                                <Button size="small" color="error" onClick={() => handleDeleteComp(c)}>Xoá</Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Stack>
              )}

              {tab === 2 && (
                <Stack spacing={1}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Lịch sử sự cố ({resolvedInc.length})
                  </Typography>
                  {resolvedInc.length === 0 ? (
                    <Alert severity="info">Chưa có sự cố nào đã hoàn thành.</Alert>
                  ) : (
                    resolvedInc.map(inc => (
                      <Paper key={inc._id} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                          <Stack spacing={0.5}>
                            <Typography variant="body2" fontWeight="bold">
                              {getTypeName(inc.typeCode)}
                            </Typography>
                            <Chip
                              label={PRIORITY_LABEL[inc.priority]?.label ?? `P${inc.priority}`}
                              color={PRIORITY_LABEL[inc.priority]?.color ?? 'default'}
                              size="small"
                              sx={{ width: 'fit-content' }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              Báo cáo: {new Date(inc.reportedAt).toLocaleString('vi-VN')}
                            </Typography>
                            {inc.resolvedAt && (
                              <Typography variant="caption" color="text.secondary">
                                Hoàn thành: {new Date(inc.resolvedAt).toLocaleString('vi-VN')}
                              </Typography>
                            )}
                          </Stack>
                          <Chip label="Hoàn thành" color="success" size="small" />
                        </Stack>
                      </Paper>
                    ))
                  )}
                </Stack>
              )}
            </>
          )}
        </Box>
      </Box>

      {compDialog}
    </>
  )
}