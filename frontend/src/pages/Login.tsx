import { useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import api from '../api'
import type { User } from '../types'

interface LoginProps {
  onLogin: (user: User) => void
}

const tokenKey = 'access_token'

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<{ access_token: string }>('/api/auth/login', { email, password })
      localStorage.setItem(tokenKey, res.data.access_token)
      const me = await api.get<User>('/api/auth/me')
      onLogin(me.data)
    } catch {
      setError('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="70vh">
      <Card sx={{ width: 400 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom fontWeight="bold">
             Hệ thống điều phối ứng cứu sự cố
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Vui lòng đăng nhập để tiếp tục
          </Typography>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              fullWidth
              size="small"
              autoFocus
            />
            <TextField
              label="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              fullWidth
              size="small"
            />
            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
