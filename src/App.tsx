import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import EmployeeForm from './pages/EmployeeForm'
import Login from './pages/Login'
import Employees from './pages/hr/Employees'
import HrLayout from './pages/hr/HrLayout'
import Outbox from './pages/hr/Outbox'
import RequestCard from './pages/hr/RequestCard'
import RequestsList from './pages/hr/RequestsList'
import Rules from './pages/hr/Rules'
import Templates from './pages/hr/Templates'
import Timeline from './pages/hr/Timeline'

// Новая ссылка с другим кодом (?t=…) заново заполняет форму
function FormPage() {
  return <EmployeeForm key={useLocation().search} />
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-4 text-center text-slate-700">
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="text-sm text-slate-500">Возможно, ссылка набрана с ошибкой.</p>
      <div className="flex gap-4 text-sm">
        <Link to="/form" className="text-sky-700 underline">Подать заявление</Link>
        <Link to="/hr/requests" className="text-sky-700 underline">Раздел HR</Link>
      </div>
    </div>
  )
}

// /form — отдельная страница для сотрудников (без входа), /hr — раздел HR (после входа)
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/hr/requests" replace />} />
        <Route path="/form" element={<FormPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/hr" element={<HrLayout />}>
          <Route index element={<Navigate to="requests" replace />} />
          <Route path="requests" element={<RequestsList />} />
          <Route path="requests/:id" element={<RequestCard />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="rules" element={<Rules />} />
          <Route path="templates" element={<Templates />} />
          <Route path="outbox" element={<Outbox />} />
          <Route path="employees" element={<Employees />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
