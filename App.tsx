import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './contexts/DataContext';
import { Layout } from './components/Layout';
import { UploadPage } from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage'; // [Restored]
import { ExportPreviewPage } from './pages/ExportPreviewPage';
import './index.css';

import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { StrategicStaffPage } from './pages/StrategicStaffPage'; // Imported
// import { DataProcessingPage } from './pages/DataProcessingPage'; // [Missing]
import { RegularStaffPage } from './pages/RegularStaffPage';

import { AttendanceManagementPage } from './pages/AttendanceManagementPage'; // New Component
import SpecialWorkExportPage from '@/pages/SpecialWorkExportPage';
import { SpecialWorkPage } from './pages/SpecialWorkPage';
import { HourlyWagePage } from './pages/HourlyWagePage'; // Added
import AttendanceCalendarPage from './pages/AttendanceCalendarPage'; // Fixed import
import ApprovalManagementPage from './pages/ApprovalManagementPage'; // Added

import EmployeeCodeUpdatePage from './pages/EmployeeCodeUpdatePage'; // Added

function RequireAuth({ children }: { children: React.ReactNode }) {
    // Basic check for demo
    const user = localStorage.getItem('user');
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
}

function App() {
    return (
        <Router>
            <DataProvider>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignupPage />} />

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
                                        <Route path="/upload" element={<UploadPage />} />
                                        <Route path="/employees/strategic" element={<StrategicStaffPage />} />
                                        <Route path="/processing" element={<AttendanceManagementPage />} />
                                        <Route path="/special-work-management" element={<SpecialWorkPage />} />
                                        <Route path="/special-work/export" element={<SpecialWorkExportPage />} />
                                        <Route path="/hourly-wage" element={<HourlyWagePage />} /> {/* Added */}
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
            </DataProvider>
        </Router>
    );
}

export default App;