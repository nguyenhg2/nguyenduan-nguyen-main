import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppBar, Box, Button, Stack, Toolbar, Typography } from '@mui/material'

import api from './api'
import type { User } from './types'
import Login from './pages/Login'
import CompanyPortal from './pages/CompanyPortal'

const tokenKey = 'access_token'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setLoading(false); return }
    api.get<User>('/api/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem(tokenKey))
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    localStorage.removeItem(tokenKey)
    setUser(null)
  }

  if (loading) return <Box p={4}>Đang tải...</Box>

  return (
    <BrowserRouter>
      <AppBar position="static" color="primary" elevation={2}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            🚨 Hệ thống điều phối ứng cứu sự cố
          </Typography>
          {user && (
            <Stack direction="row" gap={1.5} alignItems="center">
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {user.email}
              </Typography>
              <Button color="inherit" size="small" onClick={handleLogout}>
                Đăng xuất
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ py: 3, px: { xs: 2, md: 3 } }}>
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/company" replace /> : <Login onLogin={setUser} />}
          />
          <Route
            path="/company"
            element={user ? <CompanyPortal user={user} /> : <Navigate to="/login" replace />}
          />
          <Route path="/" element={<Navigate to={user ? '/company' : '/login'} replace />} />
          <Route path="*" element={<Navigate to={user ? '/company' : '/login'} replace />} />
        </Routes>
      </Box>
    </BrowserRouter>
  )
}
