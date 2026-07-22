{{/*
Expand the name of the chart.
*/}}
{{- define "taskflow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name (release-name + chart-name, deduped).
*/}}
{{- define "taskflow.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label (name-version).
*/}}
{{- define "taskflow.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "taskflow.labels" -}}
helm.sh/chart: {{ include "taskflow.chart" . }}
{{ include "taskflow.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (stable — used in matchLabels and Service selectors).
*/}}
{{- define "taskflow.selectorLabels" -}}
app.kubernetes.io/name: {{ include "taskflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL DSN — asyncpg format (FastAPI backend).
*/}}
{{- define "taskflow.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql+asyncpg://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ .Release.Name }}-postgresql/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{ required "externalPostgresql.url required when postgresql.enabled=false" .Values.externalPostgresql.url }}
{{- end -}}
{{- end }}

{{/*
PostgreSQL DSN — libpq/pg format (Hocuspocus Node.js service).
*/}}
{{- define "taskflow.postgresUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ .Release.Name }}-postgresql/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{- .Values.externalPostgresql.url | replace "postgresql+asyncpg://" "postgresql://" -}}
{{- end -}}
{{- end }}

{{/*
Redis URL.
*/}}
{{- define "taskflow.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ .Release.Name }}-redis-master:6379/0
{{- else -}}
{{ required "externalRedis.url required when redis.enabled=false" .Values.externalRedis.url }}
{{- end -}}
{{- end }}

{{/*
MinIO / S3 endpoint (host:port, no scheme).
*/}}
{{- define "taskflow.minioEndpoint" -}}
{{- if .Values.minio.enabled -}}
{{ .Release.Name }}-minio:9000
{{- else -}}
{{ required "externalS3.endpoint required when minio.enabled=false" .Values.externalS3.endpoint }}
{{- end -}}
{{- end }}

{{/*
MinIO / S3 access key.
*/}}
{{- define "taskflow.minioAccessKey" -}}
{{- if .Values.minio.enabled -}}
{{ .Values.minio.auth.rootUser }}
{{- else -}}
{{ .Values.externalS3.accessKey }}
{{- end -}}
{{- end }}

{{/*
MinIO / S3 secret key.
*/}}
{{- define "taskflow.minioSecretKey" -}}
{{- if .Values.minio.enabled -}}
{{ .Values.minio.auth.rootPassword }}
{{- else -}}
{{ .Values.externalS3.secretKey }}
{{- end -}}
{{- end }}

{{/*
MinIO / S3 bucket name.
*/}}
{{- define "taskflow.minioBucket" -}}
{{- if .Values.minio.enabled -}}
{{ .Values.minio.defaultBuckets }}
{{- else -}}
{{ .Values.externalS3.bucket }}
{{- end -}}
{{- end }}

{{/*
MinIO use-SSL flag string.
*/}}
{{- define "taskflow.minioUseSsl" -}}
{{- if .Values.minio.enabled -}}
false
{{- else -}}
{{ .Values.externalS3.useSsl }}
{{- end -}}
{{- end }}


{{/*
Backend internal base URL (used by Hocuspocus to reach FastAPI internal routes).
*/}}
{{- define "taskflow.backendInternalUrl" -}}
http://{{ include "taskflow.fullname" . }}-backend:{{ .Values.backend.service.port }}
{{- end }}

{{/*
Backend public base_url (avatar URLs, etc.).
*/}}
{{- define "taskflow.backendBaseUrl" -}}
{{- if .Values.backend.env.baseUrl -}}
{{ .Values.backend.env.baseUrl }}
{{- else if .Values.ingress.enabled -}}
https://{{ .Values.ingress.host }}
{{- else -}}
http://localhost:8000
{{- end -}}
{{- end }}
