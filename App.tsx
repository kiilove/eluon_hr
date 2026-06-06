import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './contexts/DataContext';
import { MessageModalProvider } from './contexts/MessageModalContext';
import { Layout } from './components/Layout';
import { Loader2 } from 'lucide-react';
import './index.css';

// Lazy Imports for Code Splitting
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const UploadPage = React.lazy(() => import('./pages/UploadPage').then(module => ({ default: module.UploadPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const ExportPreviewPage = React.lazy(() => import('./pages/ExportPreviewPage').then(module => ({ default: module.ExportPreviewPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })));
const SignupPage = React.lazy(() => import('./pages/SignupPage').then(module => ({ default: module.SignupPage })));
const StrategicStaffPage = React.lazy(() => import('./pages/StrategicStaffPage').then(module => ({ default: module.StrategicStaffPage })));
const RegularStaffPage = React.lazy(() => import('./pages/RegularStaffPage').then(module => ({ default: module.RegularStaffPage })));
const AttendanceManagementPage = React.lazy(() => import('./pages/AttendanceManagementPage').then(module => ({ default: module.AttendanceManagementPage })));
const SpecialWorkExportPage = React.lazy(() => import('@/pages/SpecialWorkExportPage'));
const SpecialWorkPage = React.lazy(() => import('./pages/SpecialWorkPage').then(module => ({ default: module.SpecialWorkPage })));
const HourlyWagePage = React.lazy(() => import('./pages/HourlyWagePage').then(module => ({ default: module.HourlyWagePage })));
const AttendanceCalendarPage = React.lazy(() => import('./pages/AttendanceCalendarPage'));
const ApprovalManagementPage = React.lazy(() => import('./pages/ApprovalManagementPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage').then(module => ({ default: module.ForgotPasswordPage })));
const EmployeeCodeUpdatePage = React.lazy(() => import('./pages/EmployeeCodeUpdatePage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
    // Basic check for demo
    const user = localStorage.getItem('user');
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
}

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
);

function App() {
    return (
        <MessageModalProvider>
            <Router>
                <DataProvider>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            {/* Public Routes */}
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/signup" element={<SignupPage />} />
                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

                            {/* Protected Routes */}
                            <Route
                                path="/*"
                                element={
                                    <RequireAuth>
                                        <Layout>
                                            <Routes>
                                                <Route path="/" element={<DashboardPage />} />
                                                <Route path="/dashboard" element={<DashboardPage />} />
                                                <Route path="/upload" element={<UploadPage />} />
                                                <Route path="/settings" element={<SettingsPage />} />
                                                <Route path="/export-preview" element={<ExportPreviewPage />} />
                                                <Route path="/employees/strategic" element={<StrategicStaffPage />} />
                                                <Route path="/processing" element={<AttendanceManagementPage />} />
                                                <Route path="/special-work-management" element={<SpecialWorkPage />} />
                                                <Route path="/special-work/export" element={<SpecialWorkExportPage />} />
                                                <Route path="/hourly-wage" element={<HourlyWagePage />} />
                                                <Route path="/attendance-calendar" element={<AttendanceCalendarPage />} />
                                                <Route path="/approvals/management" element={<ApprovalManagementPage />} />
                                                <Route path="/temp/update-codes" element={<EmployeeCodeUpdatePage />} />
                                                {/* Future Routes */}
                                                <Route path="/employees/regular" element={<RegularStaffPage />} />
                                            </Routes>
                                        </Layout>
                                    </RequireAuth>
                                }
                            />
                        </Routes>
                    </Suspense>
                </DataProvider>
            </Router>
        </MessageModalProvider>
    );
}

export default App;