import { onRequestPost as __api_auth_login_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\auth\\login.ts"
import { onRequestPost as __api_auth_signup_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\auth\\signup.ts"
import { onRequestPost as __api_processing_save_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\processing\\save.ts"
import { onRequestGet as __api_strategic_attendance_ts_onRequestGet } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\attendance.ts"
import { onRequestPost as __api_strategic_attendance_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\attendance.ts"
import { onRequestPost as __api_strategic_generate_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\generate.ts"
import { onRequestDelete as __api_strategic_leaves_ts_onRequestDelete } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\leaves.ts"
import { onRequestGet as __api_strategic_leaves_ts_onRequestGet } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\leaves.ts"
import { onRequestPost as __api_strategic_leaves_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\leaves.ts"
import { onRequestDelete as __api_strategic__id__ts_onRequestDelete } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\[id].ts"
import { onRequestPut as __api_strategic__id__ts_onRequestPut } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\[id].ts"
import { onRequestGet as __api_employees_ts_onRequestGet } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\employees.ts"
import { onRequestPost as __api_employees_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\employees.ts"
import { onRequestGet as __api_strategic_index_ts_onRequestGet } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\index.ts"
import { onRequestPost as __api_strategic_index_ts_onRequestPost } from "D:\\app3\\auditready_-hr-data-cleansing\\functions\\api\\strategic\\index.ts"

export const routes = [
    {
      routePath: "/api/auth/login",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_login_ts_onRequestPost],
    },
  {
      routePath: "/api/auth/signup",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_signup_ts_onRequestPost],
    },
  {
      routePath: "/api/processing/save",
      mountPath: "/api/processing",
      method: "POST",
      middlewares: [],
      modules: [__api_processing_save_ts_onRequestPost],
    },
  {
      routePath: "/api/strategic/attendance",
      mountPath: "/api/strategic",
      method: "GET",
      middlewares: [],
      modules: [__api_strategic_attendance_ts_onRequestGet],
    },
  {
      routePath: "/api/strategic/attendance",
      mountPath: "/api/strategic",
      method: "POST",
      middlewares: [],
      modules: [__api_strategic_attendance_ts_onRequestPost],
    },
  {
      routePath: "/api/strategic/generate",
      mountPath: "/api/strategic",
      method: "POST",
      middlewares: [],
      modules: [__api_strategic_generate_ts_onRequestPost],
    },
  {
      routePath: "/api/strategic/leaves",
      mountPath: "/api/strategic",
      method: "DELETE",
      middlewares: [],
      modules: [__api_strategic_leaves_ts_onRequestDelete],
    },
  {
      routePath: "/api/strategic/leaves",
      mountPath: "/api/strategic",
      method: "GET",
      middlewares: [],
      modules: [__api_strategic_leaves_ts_onRequestGet],
    },
  {
      routePath: "/api/strategic/leaves",
      mountPath: "/api/strategic",
      method: "POST",
      middlewares: [],
      modules: [__api_strategic_leaves_ts_onRequestPost],
    },
  {
      routePath: "/api/strategic/:id",
      mountPath: "/api/strategic",
      method: "DELETE",
      middlewares: [],
      modules: [__api_strategic__id__ts_onRequestDelete],
    },
  {
      routePath: "/api/strategic/:id",
      mountPath: "/api/strategic",
      method: "PUT",
      middlewares: [],
      modules: [__api_strategic__id__ts_onRequestPut],
    },
  {
      routePath: "/api/employees",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_employees_ts_onRequestGet],
    },
  {
      routePath: "/api/employees",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_employees_ts_onRequestPost],
    },
  {
      routePath: "/api/strategic",
      mountPath: "/api/strategic",
      method: "GET",
      middlewares: [],
      modules: [__api_strategic_index_ts_onRequestGet],
    },
  {
      routePath: "/api/strategic",
      mountPath: "/api/strategic",
      method: "POST",
      middlewares: [],
      modules: [__api_strategic_index_ts_onRequestPost],
    },
  ]