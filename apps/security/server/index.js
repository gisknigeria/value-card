import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { canManageRank, normalizeCommand, ranksBelow } from '../shared/policeData.js';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE || join(__dirname, 'data.json');
const secret = process.env.JWT_SECRET || 'demo-only-change-me';
const databaseUrl = process.env.DATABASE_URL;
const seed = {
  users: [
    { id: 'u0', name: 'System Super Admin', email: 'superadmin@command.local', password: bcrypt.hashSync('superadmin123', 10), role: 'Super Admin', rank: 'Super Admin', active: true, unit: 'System Control', command: 'Oyo State Command', division: '', lga: '', lat: 7.3775, lng: 3.9470 },
    { id: 'u1', name: 'Control Room Admin', email: 'admin@command.local', password: bcrypt.hashSync('admin123', 10), role: 'Admin', rank: 'Admin', active: true, unit: 'Control Room', command: 'Oyo State Command', division: '', lga: '', lat: 7.3775, lng: 3.9470 }
  ],
  incidents: [],
  cameras: [],
  mapLayers: [],
  chatRooms: [],
  chatMembers: [],
  chatMessages: []
};

let jsonDb = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : seed;
jsonDb.cameras ||= [];
jsonDb.mapLayers ||= [];
jsonDb.chatRooms ||= [];
jsonDb.chatMembers ||= [];
jsonDb.chatMessages ||= [];
jsonDb.users = jsonDb.users.filter(user => !['u2', 'u3'].includes(user.id));
if (!jsonDb.users.some(user => user.role === 'Super Admin')) jsonDb.users.unshift(seed.users[0]);
jsonDb.users = jsonDb.users.map(user => user.role === 'Admin' ? { ...user, rank: 'Admin', name: user.name === 'Command Admin' ? 'Control Room Admin' : user.name, unit: user.unit === 'Command' ? 'Control Room' : user.unit, command: user.command || 'Oyo State Command' } : user);
jsonDb.incidents = jsonDb.incidents.filter(incident => !['i1', 'i2', 'i3'].includes(incident.id) && incident.createdBy !== 'seed');
const saveJson = () => writeFileSync(dataFile, JSON.stringify(jsonDb, null, 2));
if (!databaseUrl) saveJson();

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const publicUser = ({ password, ...user }) => user;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const toUser = row => row && ({ id: row.id, name: row.name, email: row.email, password: row.password, role: row.role, rank: row.rank || '', active: row.active, unit: row.unit, unitType: row.unit_type || 'Division', command: row.command || '', division: row.division || '', station: row.station || '', lga: row.lga || '', lat: Number(row.lat) || 7.3775, lng: Number(row.lng) || 3.9470 });
const toIncident = row => row && ({ id: row.id, title: row.title, description: row.description, reportType: row.report_type || 'IP', severity: row.severity, status: row.status, lat: Number(row.lat), lng: Number(row.lng), assignedTo: row.assigned_to || '', visibleTo: row.visible_to || [], media: row.media || [], geometry: row.geometry || null, style: row.style || null, createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at, createdBy: row.created_by || '' });
const toCamera = row => row && ({ id: row.id, name: row.name, type: row.type, url: row.url, lat: Number(row.lat), lng: Number(row.lng), status: row.status, createdAt: row.created_at?.toISOString?.() || row.created_at });
const toMapLayer = row => row && ({ id: row.id, name: row.name, type: row.type, data: row.data, url: row.url || '', bounds: row.bounds, opacity: Number(row.opacity ?? 0.65), fillOpacity: Number(row.fill_opacity ?? 0.18), category: row.category || (row.type === 'raster' ? 'Raster' : 'Point'), operationalUse: row.operational_use || 'Reference', color: row.color || '#facc15', fillColor: row.fill_color || '#f59e0b', lineWeight: Number(row.line_weight || 2), lineStyle: row.line_style || 'solid', pointIcon: row.point_icon || 'pin', pointIconColor: row.point_icon_color || '#ffffff', pointSize: Number(row.point_size || 24), showLabels: row.show_labels ?? true, labelField: row.label_field || 'name', popupFields: row.popup_fields || '', visible: row.visible ?? true, zIndex: Number(row.z_index || 0), createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at });
const toChatRoom = row => row && ({ id: row.id, name: row.name, type: row.type || 'room', incidentId: row.incident_id || '', createdBy: row.created_by || '', createdAt: row.created_at?.toISOString?.() || row.created_at, members: row.members || [] });
const toChatMessage = row => row && ({ id: row.id, roomId: row.room_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at?.toISOString?.() || row.created_at });

async function initPostgres() {
  if (!pool) return;
  await pool.query(`
    create table if not exists users (
      id text primary key,
      name text not null,
      email text not null unique,
      password text not null,
      role text not null default 'Officer',
      rank text default '',
      active boolean not null default true,
      unit text default 'Field Unit',
      unit_type text default 'Division',
      command text default '',
      division text default '',
      station text default '',
      lga text default '',
      lat double precision default 7.3775,
      lng double precision default 3.9470
    );
    create table if not exists incidents (
      id text primary key,
      title text not null,
      description text default '',
      report_type text default 'IP',
      severity text default 'High',
      status text default 'Open',
      lat double precision not null,
      lng double precision not null,
      assigned_to text default '',
      visible_to jsonb default '[]'::jsonb,
      media jsonb default '[]'::jsonb,
      geometry jsonb,
      style jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz,
      created_by text default ''
    );
    create table if not exists cameras (
      id text primary key,
      name text not null,
      type text default 'CCTV',
      url text not null,
      lat double precision default 7.3775,
      lng double precision default 3.9470,
      status text default 'Online',
      created_at timestamptz default now()
    );
    create table if not exists map_layers (
      id text primary key,
      name text not null,
      type text not null,
      data jsonb,
      url text,
      bounds jsonb,
      opacity double precision default 0.65,
      fill_opacity double precision default 0.18,
      category text default 'Point',
      operational_use text default 'Reference',
      color text default '#facc15',
      fill_color text default '#f59e0b',
      line_weight double precision default 2,
      line_style text default 'solid',
      point_icon text default 'pin',
      point_icon_color text default '#ffffff',
      point_size double precision default 24,
      show_labels boolean default true,
      label_field text default 'name',
      popup_fields text default '',
      visible boolean default true,
      z_index integer default 0,
      created_at timestamptz default now(),
      updated_at timestamptz
    );
    create table if not exists chat_rooms (
      id text primary key,
      name text not null,
      type text default 'room',
      incident_id text default '',
      created_by text default '',
      created_at timestamptz default now()
    );
    create table if not exists chat_members (
      room_id text not null,
      user_id text not null,
      primary key (room_id, user_id)
    );
    create table if not exists chat_messages (
      id text primary key,
      room_id text not null,
      sender_id text not null,
      body text not null,
      created_at timestamptz default now()
    );
    create table if not exists security_access_events (
      id text primary key,
      card_id text,
      membership_id text,
      resident_id text,
      resident_name text,
      direction text not null,
      gate text not null,
      decision text not null,
      reason text default '',
      scanned_by text not null,
      scanned_at timestamptz default now()
    );
    create index if not exists security_access_events_scanned_at_idx
      on security_access_events (scanned_at desc);
    create index if not exists security_access_events_membership_id_idx
      on security_access_events (membership_id);
  `);
  await pool.query(`
    alter table users add column if not exists rank text default '';
    alter table users add column if not exists unit_type text default 'Division';
    alter table users add column if not exists command text default '';
    alter table users add column if not exists division text default '';
    alter table users add column if not exists station text default '';
    alter table users add column if not exists lga text default '';
    alter table incidents add column if not exists report_type text default 'IP';
    alter table incidents add column if not exists visible_to jsonb default '[]'::jsonb;
    alter table incidents add column if not exists media jsonb default '[]'::jsonb;
    alter table incidents add column if not exists geometry jsonb;
    alter table incidents add column if not exists style jsonb;
    alter table map_layers add column if not exists category text default 'Point';
    alter table map_layers add column if not exists operational_use text default 'Reference';
    alter table map_layers add column if not exists color text default '#facc15';
    alter table map_layers add column if not exists fill_color text default '#f59e0b';
    alter table map_layers add column if not exists fill_opacity double precision default 0.18;
    alter table map_layers add column if not exists line_weight double precision default 2;
    alter table map_layers add column if not exists line_style text default 'solid';
    alter table map_layers add column if not exists point_icon text default 'pin';
    alter table map_layers add column if not exists point_icon_color text default '#ffffff';
    alter table map_layers add column if not exists point_size double precision default 24;
    alter table map_layers add column if not exists show_labels boolean default true;
    alter table map_layers add column if not exists label_field text default 'name';
    alter table map_layers add column if not exists popup_fields text default '';
    alter table map_layers add column if not exists visible boolean default true;
    alter table map_layers add column if not exists z_index integer default 0;
    alter table map_layers add column if not exists updated_at timestamptz;
    alter table security_access_events add column if not exists scan_note text;
    alter table security_access_events add column if not exists is_override boolean not null default false;
    alter table security_access_events add column if not exists override_reason text;
    alter table security_access_events add column if not exists idempotency_key text;
    create unique index if not exists security_access_events_idempotency_key_idx on security_access_events (idempotency_key) where idempotency_key is not null;
    create index if not exists security_access_events_gate_idx on security_access_events (gate);
    create index if not exists security_access_events_decision_idx on security_access_events (decision);
    -- Visitor passes table (created by the web API, but read here for verification)
    create table if not exists visitor_passes (
      id text primary key,
      "residentId" text not null,
      code text not null unique,
      label text,
      "usedAt" timestamptz,
      "expiresAt" timestamptz not null,
      "createdAt" timestamptz default now()
    );
    create index if not exists visitor_passes_code_idx on visitor_passes (code);
    create index if not exists "visitor_passes_residentId_idx" on visitor_passes ("residentId");
    -- Walk-in guest log table
    create table if not exists walk_in_logs (
      id text primary key,
      guest_name text not null,
      guest_phone text,
      destination_merchant_id text not null,
      destination_name text not null,
      gate text not null,
      logged_by text not null,
      entry_time timestamptz default now(),
      exit_time timestamptz,
      exit_code text unique,
      acknowledged boolean not null default false,
      acknowledged_at timestamptz,
      acknowledged_by text,
      notes text
    );
    create index if not exists walk_in_logs_merchant_idx on walk_in_logs (destination_merchant_id);
    create index if not exists walk_in_logs_exit_code_idx on walk_in_logs (exit_code) where exit_code is not null;
    create index if not exists walk_in_logs_entry_time_idx on walk_in_logs (entry_time desc);
  `);
  const { rows } = await pool.query('select count(*)::int as count from users');
  await pool.query("delete from incidents where id in ('i1','i2','i3') or created_by='seed'");
  await pool.query("delete from users where id in ('u2','u3')");
  const superAdmin = seed.users[0];
  await pool.query('insert into users (id,name,email,password,role,rank,active,unit,unit_type,command,division,station,lga,lat,lng) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (email) do nothing', [superAdmin.id, superAdmin.name, superAdmin.email, superAdmin.password, superAdmin.role, superAdmin.rank, superAdmin.active, superAdmin.unit, superAdmin.unitType || 'HQTS', superAdmin.command, superAdmin.division, superAdmin.station || '', superAdmin.lga, superAdmin.lat, superAdmin.lng]);
  if (rows[0].count > 0) return;
  for (const user of seed.users.slice(1)) {
    await pool.query('insert into users (id,name,email,password,role,rank,active,unit,unit_type,command,division,station,lga,lat,lng) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [user.id, user.name, user.email, user.password, user.role, user.rank, user.active, user.unit, user.unitType || 'Division', user.command, user.division, user.station || '', user.lga, user.lat, user.lng]);
  }
}

const store = {
  async users() {
    if (!pool) return jsonDb.users;
    const { rows } = await pool.query('select * from users order by role, name');
    return rows.map(toUser);
  },
  async userByEmail(email) {
    if (!pool) return jsonDb.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.active);
    const { rows } = await pool.query('select * from users where lower(email)=lower($1) and active=true limit 1', [email]);
    return toUser(rows[0]);
  },
  async createUser(user) {
    if (!pool) { jsonDb.users.push(user); saveJson(); return user; }
    const { rows } = await pool.query('insert into users (id,name,email,password,role,rank,active,unit,unit_type,command,division,station,lga,lat,lng) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *', [user.id, user.name, user.email, user.password, user.role, user.rank, user.active, user.unit, user.unitType || 'Division', user.command, user.division, user.station || '', user.lga, user.lat, user.lng]);
    return toUser(rows[0]);
  },
  async updateUserPassword(id, password) {
    if (!pool) {
      const user = jsonDb.users.find(item => item.id === id);
      if (!user) return null;
      user.password = password;
      saveJson();
      return user;
    }
    const { rows } = await pool.query('update users set password=$2 where id=$1 returning *', [id, password]);
    return toUser(rows[0]);
  },
  async deleteUser(id) {
    if (!pool) {
      const before = jsonDb.users.length;
      jsonDb.users = jsonDb.users.filter(user => user.id !== id);
      jsonDb.incidents = jsonDb.incidents.map(incident => incident.assignedTo === id ? { ...incident, assignedTo: '' } : incident);
      saveJson();
      return jsonDb.users.length !== before;
    }
    const { rowCount } = await pool.query('delete from users where id=$1', [id]);
    await pool.query("update incidents set assigned_to='' where assigned_to=$1", [id]);
    return rowCount > 0;
  },
  async incidents() {
    if (!pool) return jsonDb.incidents;
    const { rows } = await pool.query('select * from incidents order by created_at desc');
    return rows.map(toIncident);
  },
  async createIncident(incident) {
    if (!pool) { jsonDb.incidents.unshift(incident); saveJson(); return incident; }
    const { rows } = await pool.query('insert into incidents (id,title,description,report_type,severity,status,lat,lng,assigned_to,visible_to,media,geometry,style,created_at,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *', [incident.id, incident.title, incident.description, incident.reportType, incident.severity, incident.status, incident.lat, incident.lng, incident.assignedTo, JSON.stringify(incident.visibleTo || []), JSON.stringify(incident.media || []), JSON.stringify(incident.geometry || null), JSON.stringify(incident.style || null), incident.createdAt, incident.createdBy]);
    return toIncident(rows[0]);
  },
  async updateIncident(id, patch) {
    if (!pool) {
      const index = jsonDb.incidents.findIndex(i => i.id === id);
      if (index < 0) return null;
      jsonDb.incidents[index] = { ...jsonDb.incidents[index], ...patch, id, updatedAt: new Date().toISOString() };
      saveJson();
      return jsonDb.incidents[index];
    }
    const current = await pool.query('select * from incidents where id=$1', [id]);
    if (!current.rows[0]) return null;
    const merged = { ...toIncident(current.rows[0]), ...patch, id, updatedAt: new Date().toISOString() };
    const { rows } = await pool.query('update incidents set title=$2, description=$3, report_type=$4, severity=$5, status=$6, lat=$7, lng=$8, assigned_to=$9, visible_to=$10, media=$11, geometry=$12, style=$13, updated_at=$14 where id=$1 returning *', [id, merged.title, merged.description, merged.reportType, merged.severity, merged.status, merged.lat, merged.lng, merged.assignedTo, JSON.stringify(merged.visibleTo || []), JSON.stringify(merged.media || []), JSON.stringify(merged.geometry || null), JSON.stringify(merged.style || null), merged.updatedAt]);
    return toIncident(rows[0]);
  },
  async deleteIncident(id) {
    if (!pool) { jsonDb.incidents = jsonDb.incidents.filter(i => i.id !== id); saveJson(); return; }
    await pool.query('delete from incidents where id=$1', [id]);
  },
  async cameras() {
    if (!pool) return jsonDb.cameras;
    const { rows } = await pool.query('select * from cameras order by created_at desc');
    return rows.map(toCamera);
  },
  async createCamera(camera) {
    if (!pool) { jsonDb.cameras.push(camera); saveJson(); return camera; }
    const { rows } = await pool.query('insert into cameras (id,name,type,url,lat,lng,status,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *', [camera.id, camera.name, camera.type, camera.url, camera.lat, camera.lng, camera.status, camera.createdAt]);
    return toCamera(rows[0]);
  },
  async deleteCamera(id) {
    if (!pool) { jsonDb.cameras = jsonDb.cameras.filter(camera => camera.id !== id); saveJson(); return; }
    await pool.query('delete from cameras where id=$1', [id]);
  },
  async mapLayers() {
    if (!pool) return jsonDb.mapLayers || [];
    const { rows } = await pool.query('select * from map_layers order by created_at desc');
    return rows.map(toMapLayer);
  },
  async createMapLayer(layer) {
    if (!pool) { jsonDb.mapLayers ||= []; jsonDb.mapLayers.unshift(layer); saveJson(); return layer; }
    const { rows } = await pool.query('insert into map_layers (id,name,type,data,url,bounds,opacity,fill_opacity,category,operational_use,color,fill_color,line_weight,line_style,point_icon,point_icon_color,point_size,show_labels,label_field,popup_fields,visible,z_index,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning *', [layer.id, layer.name, layer.type, layer.data || null, layer.url || null, layer.bounds || null, layer.opacity, layer.fillOpacity ?? 0.18, layer.category, layer.operationalUse || 'Reference', layer.color, layer.fillColor, layer.lineWeight || 2, layer.lineStyle || 'solid', layer.pointIcon || 'pin', layer.pointIconColor || '#ffffff', layer.pointSize || 24, layer.showLabels, layer.labelField, layer.popupFields || '', layer.visible, layer.zIndex, layer.createdAt]);
    return toMapLayer(rows[0]);
  },
  async updateMapLayer(id, changes) {
    if (!pool) {
      const index = (jsonDb.mapLayers || []).findIndex(layer => layer.id === id);
      if (index < 0) return null;
      jsonDb.mapLayers[index] = { ...jsonDb.mapLayers[index], ...changes, updatedAt: new Date().toISOString() };
      saveJson();
      return jsonDb.mapLayers[index];
    }
    const current = await pool.query('select * from map_layers where id=$1', [id]);
    if (!current.rows[0]) return null;
    const merged = { ...toMapLayer(current.rows[0]), ...changes, updatedAt: new Date().toISOString() };
    const { rows } = await pool.query('update map_layers set name=$2, opacity=$3, fill_opacity=$4, category=$5, operational_use=$6, color=$7, fill_color=$8, line_weight=$9, line_style=$10, point_icon=$11, point_icon_color=$12, point_size=$13, show_labels=$14, label_field=$15, popup_fields=$16, visible=$17, z_index=$18, updated_at=$19 where id=$1 returning *', [id, merged.name, merged.opacity, merged.fillOpacity, merged.category, merged.operationalUse, merged.color, merged.fillColor, merged.lineWeight, merged.lineStyle, merged.pointIcon, merged.pointIconColor, merged.pointSize, merged.showLabels, merged.labelField, merged.popupFields, merged.visible, merged.zIndex, merged.updatedAt]);
    return toMapLayer(rows[0]);
  },
  async deleteMapLayer(id) {
    if (!pool) { jsonDb.mapLayers = (jsonDb.mapLayers || []).filter(layer => layer.id !== id); saveJson(); return; }
    await pool.query('delete from map_layers where id=$1', [id]);
  },
  async chatRooms(viewer) {
    if (!pool) {
      const rooms = isAdminRole(viewer) ? jsonDb.chatRooms : jsonDb.chatRooms.filter(room => jsonDb.chatMembers.some(member => member.roomId === room.id && member.userId === viewer.id));
      return rooms.map(room => ({ ...room, members: jsonDb.chatMembers.filter(member => member.roomId === room.id).map(member => member.userId) }));
    }
    const query = isAdminRole(viewer)
      ? 'select r.*, coalesce(array_agg(m.user_id) filter (where m.user_id is not null), array[]::text[]) as members from chat_rooms r left join chat_members m on m.room_id=r.id group by r.id order by r.created_at desc'
      : 'select r.*, coalesce(array_agg(m.user_id) filter (where m.user_id is not null), array[]::text[]) as members from chat_rooms r join chat_members own on own.room_id=r.id and own.user_id=$1 left join chat_members m on m.room_id=r.id group by r.id order by r.created_at desc';
    const { rows } = await pool.query(query, isAdminRole(viewer) ? [] : [viewer.id]);
    return rows.map(toChatRoom);
  },
  async chatRoom(id) {
    if (!pool) {
      const room = jsonDb.chatRooms.find(item => item.id === id);
      return room && { ...room, members: jsonDb.chatMembers.filter(member => member.roomId === id).map(member => member.userId) };
    }
    const { rows } = await pool.query('select r.*, coalesce(array_agg(m.user_id) filter (where m.user_id is not null), array[]::text[]) as members from chat_rooms r left join chat_members m on m.room_id=r.id where r.id=$1 group by r.id', [id]);
    return toChatRoom(rows[0]);
  },
  async createChatRoom(room, memberIds = []) {
    const uniqueMembers = [...new Set([room.createdBy, ...memberIds].filter(Boolean))];
    if (!pool) {
      jsonDb.chatRooms.unshift(room);
      uniqueMembers.forEach(userId => jsonDb.chatMembers.push({ roomId: room.id, userId }));
      saveJson();
      return { ...room, members: uniqueMembers };
    }
    const { rows } = await pool.query('insert into chat_rooms (id,name,type,incident_id,created_by,created_at) values ($1,$2,$3,$4,$5,$6) returning *', [room.id, room.name, room.type, room.incidentId || '', room.createdBy, room.createdAt]);
    for (const userId of uniqueMembers) await pool.query('insert into chat_members (room_id,user_id) values ($1,$2) on conflict do nothing', [room.id, userId]);
    return { ...toChatRoom(rows[0]), members: uniqueMembers };
  },
  async addChatMember(roomId, userId) {
    if (!pool) {
      if (!jsonDb.chatMembers.some(member => member.roomId === roomId && member.userId === userId)) jsonDb.chatMembers.push({ roomId, userId });
      saveJson();
      return this.chatRoom(roomId);
    }
    await pool.query('insert into chat_members (room_id,user_id) values ($1,$2) on conflict do nothing', [roomId, userId]);
    return this.chatRoom(roomId);
  },
  async chatMessages(roomId) {
    if (!pool) return jsonDb.chatMessages.filter(message => message.roomId === roomId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const { rows } = await pool.query('select * from chat_messages where room_id=$1 order by created_at asc', [roomId]);
    return rows.map(toChatMessage);
  },
  async createChatMessage(message) {
    if (!pool) { jsonDb.chatMessages.push(message); saveJson(); return message; }
    const { rows } = await pool.query('insert into chat_messages (id,room_id,sender_id,body,created_at) values ($1,$2,$3,$4,$5) returning *', [message.id, message.roomId, message.senderId, message.body, message.createdAt]);
    return toChatMessage(rows[0]);
  },
  async deleteChatRoom(roomId) {
    if (!pool) {
      const before = jsonDb.chatRooms.length;
      jsonDb.chatRooms = jsonDb.chatRooms.filter(room => room.id !== roomId);
      jsonDb.chatMembers = jsonDb.chatMembers.filter(member => member.roomId !== roomId);
      jsonDb.chatMessages = jsonDb.chatMessages.filter(message => message.roomId !== roomId);
      saveJson();
      return jsonDb.chatRooms.length !== before;
    }
    await pool.query('delete from chat_messages where room_id=$1', [roomId]);
    await pool.query('delete from chat_members where room_id=$1', [roomId]);
    const { rowCount } = await pool.query('delete from chat_rooms where id=$1', [roomId]);
    return rowCount > 0;
  },
  async incidentChatRoom(incident, viewer) {
    const roomId = `incident-${incident.id}`;
    let room = await this.chatRoom(roomId);
    const members = [viewer.id, incident.assignedTo].filter(Boolean);
    if (!room) {
      room = await this.createChatRoom({ id: roomId, name: `Incident ${incident.id}: ${incident.title}`, type: 'incident', incidentId: incident.id, createdBy: viewer.id, createdAt: new Date().toISOString() }, members);
    } else {
      for (const userId of members) room = await this.addChatMember(roomId, userId);
    }
    return room;
  }
};

await initPostgres();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const activeCameraShares = new Map();
const accessPointGps = new Map();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); next(); } catch { res.status(401).json({ message: 'Session expired. Please sign in again.' }); } };
const isAdminRole = user => ['Admin', 'Super Admin'].includes(user?.role);
const adminOnly = (req, res, next) => isAdminRole(req.user) ? next() : res.status(403).json({ message: 'Admin access required' });
const superAdminOnly = (req, res, next) => req.user.role === 'Super Admin' ? next() : res.status(403).json({ message: 'System administrator access required' });
const canManageUsers = user => user?.role === 'Super Admin' || user?.role === 'Admin';
const visibleUsersFor = (viewer, users) => {
  // Super Admin sees everyone except themselves
  // Admin sees everyone except Super Admin and themselves
  return users.filter(user =>
    user.id !== viewer.id &&
    (viewer.role === 'Super Admin' || user.role !== 'Super Admin')
  );
};
const canCreateUser = (viewer, rank, role) => {
  if (viewer.role === 'Super Admin') return ['Admin', 'Access Point'].includes(role);
  if (viewer.role === 'Admin') return role === 'Access Point';
  return false;
};
const canDeleteUser = (viewer, target) => {
  if (!target || target.id === viewer.id) return false;
  if (viewer.role === 'Super Admin') return true;
  if (viewer.role === 'Admin') return target.role === 'Access Point';
  return false;
};
const canAccessRoom = (viewer, room) => !!room && (isAdminRole(viewer) || room.members?.includes(viewer.id));
const isSosIncident = incident => incident?.reportType === 'SOS-Emergency' || incident?.style?.source === 'sos';
const canAccessIncident = (viewer, incident) => isAdminRole(viewer) || incident.createdBy === viewer.id || incident.assignedTo === viewer.id || (incident.visibleTo || []).includes(viewer.id);
const normalizeKey = value => String(value || '').trim().toLowerCase();
const normalizeCommandKey = value => normalizeCommand(value || '').toLowerCase();
const userIdOf = user => user?.userId || user?.id;
const distanceMeters = (a, b) => {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const startLat = toRad(lat1);
  const endLat = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const accessPointOnLocation = (req, res, next) => {
  if (req.user?.role !== 'Access Point') return next();
  const fix = accessPointGps.get(userIdOf(req.user));
  if (!fix || Date.now() - fix.receivedAt > 45000) {
    return res.status(403).json({ message: 'A current live GPS location is required so the control room can track you.' });
  }
  if (Number(fix.accuracy) > 150) {
    return res.status(403).json({ message: 'GPS accuracy is too low. Wait for a precise location fix.' });
  }
  next();
};
const isControlRoomUser = user => isAdminRole(user) || normalizeKey(user?.unit).includes('control room');
const sameOperationalSpace = (sender, receiver) => {
  if (!userIdOf(sender) || userIdOf(sender) === userIdOf(receiver)) return false;
  const senderUnitType = normalizeKey(sender.unitType || sender.unit || sender.role);
  if (senderUnitType.includes('station')) {
    return !!normalizeKey(sender.station || sender.unit) && normalizeKey(sender.station || sender.unit) === normalizeKey(receiver.station || receiver.unit);
  }
  if (senderUnitType.includes('division')) {
    return !!normalizeKey(sender.division || sender.unit) && normalizeKey(sender.division || sender.unit) === normalizeKey(receiver.division || receiver.unit);
  }
  return !!normalizeCommandKey(sender.command || sender.unit) && normalizeCommandKey(sender.command || sender.unit) === normalizeCommandKey(receiver.command || receiver.unit);
};
const sosVisibleTo = alert => {
  const ids = new Set();
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user;
    const id = userIdOf(user);
    if (!id || id === userIdOf(alert) || isControlRoomUser(user)) continue;
    if (sameOperationalSpace(alert, user) || distanceMeters(alert, user) <= 5000) ids.add(id);
  }
  return [...ids];
};
const emitEmergencyAlert = (sourceSocket, alert) => {
  const normalized = { ...alert, id: alert.id || `em-${Date.now()}`, timestamp: alert.timestamp || new Date().toISOString() };
  for (const socket of io.sockets.sockets.values()) {
    if (socket.id === sourceSocket.id) continue;
    const user = socket.data.user;
    if (!user?.userId) continue;
    const controlRoom = isControlRoomUser(user);
    const localResponder = sameOperationalSpace(normalized, user);
    const nearbyResponder = !controlRoom && distanceMeters(normalized, user) <= 5000;
    if (controlRoom || localResponder || nearbyResponder) {
      socket.emit('emergency:alert', { ...normalized, silent: controlRoom });
    }
  }
};

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'SIGAR Bodija Security API', database: pool ? 'neon-postgres' : 'json-file' }));

// BERA read-only gate events view — exposes only access events, no SIGAR operational data
// Uses a separate JWT secret so BERA admin JWT cannot be used for SIGAR operational endpoints
app.get('/api/bera/gate-events', asyncRoute(async (req, res) => {
  const beraToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!beraToken) return res.status(401).json({ message: 'Authorization required' });
  try {
    // Verify using the main API's JWT_SECRET (same as BERA admin portal)
    const beraSecret = process.env.BERA_JWT_SECRET || process.env.JWT_SECRET || secret;
    jwt.verify(beraToken, beraSecret);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired BERA token' });
  }
  if (!pool) return res.status(503).json({ message: 'Database unavailable' });
  const limit  = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const gate     = req.query.gate ? String(req.query.gate).trim() : null;
  const decision = req.query.decision ? String(req.query.decision).trim().toUpperCase() : null;
  const from     = req.query.from ? new Date(req.query.from) : null;
  const to       = req.query.to   ? new Date(req.query.to)   : null;
  const conditions = []; const params = []; let p = 1;
  if (gate)     { conditions.push(`gate = $${p++}`);       params.push(gate); }
  if (decision) { conditions.push(`decision = $${p++}`);   params.push(decision); }
  if (from)     { conditions.push(`scanned_at >= $${p++}`); params.push(from); }
  if (to)       { conditions.push(`scanned_at <= $${p++}`); params.push(to); }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const [data, count] = await Promise.all([
    pool.query(
      `select id, membership_id as "membershipId", resident_name as "residentName",
        direction, gate, decision, reason, scanned_at as "scannedAt"
       from security_access_events ${where}
       order by scanned_at desc limit $${p} offset $${p + 1}`,
      [...params, limit, offset],
    ),
    pool.query(`select count(*)::int as total from security_access_events ${where}`, params),
  ]);
  res.json({ events: data.rows, total: count.rows[0].total, limit, offset });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const user = await store.userByEmail(String(req.body.email || ''));
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password' });
  const safe = publicUser(user);
  res.json({ token: jwt.sign(safe, secret, { expiresIn: '100y' }), user: safe });
}));

app.post('/api/resident/sos', asyncRoute(async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authorization required' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.BERA_JWT_SECRET || process.env.JWT_SECRET || secret);
  } catch {
    return res.status(401).json({ message: 'Invalid resident session' });
  }

  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: 'Valid SOS location is required' });
  }

  let resident = null;
  if (pool && payload.sub) {
    const { rows } = await pool.query(
      `select r.id, r."fullName", r.neighbourhood, r."memberCategory",
        c."membershipId", c.status as "cardStatus"
       from "Resident" r
       left join "Card" c on c."residentId" = r.id
       where r."userId" = $1
       limit 1`,
      [payload.sub],
    );
    resident = rows[0] || null;
  }

  const name = resident?.fullName || String(req.body.name || 'Resident').slice(0, 100);
  const neighbourhood = resident?.neighbourhood || String(req.body.unit || '').slice(0, 100);
  const membershipId = resident?.membershipId || '';
  const alert = {
    id: `resident-sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: payload.sub || `resident-${Date.now()}`,
    name,
    type: 'Resident SOS',
    text: String(req.body.text || `${membershipId || 'Resident'} emergency alert`).slice(0, 300),
    lat,
    lng,
    accuracy: Number(req.body.accuracy) || null,
    unit: neighbourhood,
    command: neighbourhood,
    timestamp: new Date().toISOString(),
    source: 'resident',
  };

  const incident = await store.createIncident({
    id: `i${Date.now()}`,
    title: `SOS - ${name}`,
    description: `${alert.text}${membershipId ? `\nMembership: ${membershipId}` : ''}`,
    reportType: 'SOS-Emergency',
    severity: 'Critical',
    status: 'Open',
    lat,
    lng,
    assignedTo: '',
    visibleTo: [],
    media: [],
    geometry: null,
    style: { source: 'sos', icon: 'SOS', color: '#dc2626', fillColor: '#ef4444' },
    createdAt: alert.timestamp,
    createdBy: alert.userId,
  });

  io.emit('emergency:alert', alert);
  io.emit('incident:created', incident);
  res.json({ ok: true, alert, incident });
}));

app.get('/api/residents/search', auth, asyncRoute(async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Resident search requires the shared Neon database' });
  const query = String(req.query.query || '').trim();
  if (query.length < 2) return res.json({ residents: [] });
  const term = `%${query}%`;
  const { rows } = await pool.query(
    `select r.id, r."fullName", r.neighbourhood, r."memberCategory", r."photoUrl",
      r."approvalStatus", c."membershipId", c.status as "cardStatus",
      u.phone, u.email
     from "Resident" r
     join "User" u on u.id = r."userId"
     left join "Card" c on c."residentId" = r.id
     where r."fullName" ilike $1
        or r.neighbourhood ilike $1
        or r."memberCategory" ilike $1
        or r."photoUrl" ilike $1
        or u.phone ilike $1
        or coalesce(u.email, '') ilike $1
        or coalesce(c."membershipId", '') ilike $1
     order by r."fullName" asc
     limit 25`,
    [term],
  );
  res.json({ residents: rows });
}));
app.get('/api/users', auth, asyncRoute(async (req, res) => res.json(visibleUsersFor(req.user, await store.users()).map(publicUser))));
app.get('/api/report-viewers', auth, asyncRoute(async (req, res) => res.json(visibleUsersFor(req.user, await store.users()).map(publicUser))));
app.get('/api/access/events', auth, asyncRoute(async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Shared Neon database is required for access logs' });
  const limit  = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const gate      = req.query.gate ? String(req.query.gate).trim() : null;
  const decision  = req.query.decision ? String(req.query.decision).trim().toUpperCase() : null;
  const from      = req.query.from ? new Date(req.query.from) : null;
  const to        = req.query.to   ? new Date(req.query.to)   : null;
  const memberQ   = req.query.member ? String(req.query.member).trim() : null;

  const conditions = [];
  const params = [];
  let p = 1;
  if (gate)     { conditions.push(`gate = $${p++}`);                          params.push(gate); }
  if (decision) { conditions.push(`decision = $${p++}`);                      params.push(decision); }
  if (from)     { conditions.push(`scanned_at >= $${p++}`);                   params.push(from); }
  if (to)       { conditions.push(`scanned_at <= $${p++}`);                   params.push(to); }
  if (memberQ)  { conditions.push(`(membership_id ilike $${p} or resident_name ilike $${p++})`); params.push(`%${memberQ}%`); }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `select id, membership_id as "membershipId", resident_name as "residentName",
        direction, gate, decision, reason, scan_note as "scanNote",
        is_override as "isOverride", override_reason as "overrideReason",
        scanned_by as "scannedBy", scanned_at as "scannedAt"
       from security_access_events
       ${where}
       order by scanned_at desc
       limit $${p} offset $${p + 1}`,
      [...params, limit, offset],
    ),
    pool.query(`select count(*)::int as total from security_access_events ${where}`, params),
  ]);
  res.json({ events: dataResult.rows, total: countResult.rows[0].total, limit, offset });
}));

app.post('/api/access/verify', auth, accessPointOnLocation, asyncRoute(async (req, res) => {
  if (!pool) {
    // OFFLINE SAFETY: never falsely allow access when DB is unavailable
    return res.status(503).json({
      decision: 'DENIED',
      reason: 'Verification service is temporarily unavailable. Do not allow entry.',
      offline: true,
    });
  }

  const token          = String(req.body.token || '').trim();
  const direction      = String(req.body.direction || 'ENTRY').toUpperCase() === 'EXIT' ? 'EXIT' : 'ENTRY';
  const gate           = String(req.body.gate || 'Main Gate').trim().slice(0, 80) || 'Main Gate';
  const scanNote       = req.body.scanNote ? String(req.body.scanNote).slice(0, 300) : null;
  const idempotencyKey = req.body.idempotencyKey ? String(req.body.idempotencyKey).slice(0, 100) : null;
  const isOverride     = req.body.isOverride === true;
  const overrideReason = isOverride ? String(req.body.overrideReason || '').slice(0, 300) : null;

  if (!token) return res.status(400).json({ decision: 'DENIED', reason: 'No card token provided' });

  // Idempotency: return the cached result if the same scan was submitted before
  if (idempotencyKey) {
    const { rows: existing } = await pool.query(
      `select id, decision, reason, membership_id as "membershipId",
        resident_name as "residentName", scanned_at as "scannedAt"
       from security_access_events where idempotency_key = $1 limit 1`,
      [idempotencyKey],
    );
    if (existing[0]) {
      return res.json({ ...existing[0], cached: true });
    }
  }

  // Overrides require a reason and must be audited — they still record the original decision
  if (isOverride && !overrideReason) {
    return res.status(400).json({ decision: 'DENIED', reason: 'Override requires a stated reason' });
  }

  const { rows } = await pool.query(
    `select c.id as "cardId", c."membershipId", c.status as "cardStatus",
      c."expiresAt", r.id as "residentId", r."fullName", r.neighbourhood,
      r."memberCategory", null as "accessUserId"
     from "Card" c
     join "Resident" r on r.id = c."residentId"
     where c."qrToken" = $1 or c."membershipId" = $1
     limit 1`,
    [token],
  );

  // Fallback: check AccessCard (merchant / admin / security role cards)
  let accessCardRow = null;
  if (!rows[0]) {
    const { rows: acRows } = await pool.query(
      `select ac.id as "cardId", ac."cardNumber" as "membershipId", ac.status as "cardStatus",
        ac."expiresAt", u.id as "accessUserId",
        coalesce(u."displayName", u.phone) as "fullName",
        'Access card holder' as neighbourhood,
        u.role as "memberCategory"
       from "AccessCard" ac
       join "User" u on u.id = ac."userId"
       where ac."qrToken" = $1 or ac."cardNumber" = $1
       limit 1`,
      [token],
    );
    accessCardRow = acRows[0] || null;
  }

  const card = rows[0] || accessCardRow;
  const expiresAt  = card?.expiresAt ? new Date(card.expiresAt) : null;
  const validExpiry = expiresAt && expiresAt.getTime() >= Date.now();
  const naturallyAllowed = Boolean(card && card.cardStatus === 'ACTIVE' && validExpiry);

  // Override: only admins or officers above Officer role can override
  const canOverride = isAdminRole(req.user);
  if (isOverride && !canOverride) {
    return res.status(403).json({ decision: 'DENIED', reason: 'Your role does not have override authority' });
  }

  // Final decision: override forces ALLOWED but still records the original system reason
  const decision = isOverride ? 'OVERRIDE_ALLOWED' : (naturallyAllowed ? 'ALLOWED' : 'DENIED');
  const reason   = !card
    ? 'Card not found'
    : card.cardStatus !== 'ACTIVE'
      ? `Card status is ${card.cardStatus}`
      : !validExpiry
        ? 'Card has expired'
        : `${direction === 'ENTRY' ? 'Entry' : 'Exit'} verified`;

  const eventId = `access-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await pool.query(
    `insert into security_access_events
      (id, card_id, membership_id, resident_id, resident_name, direction, gate,
       decision, reason, scan_note, is_override, override_reason, scanned_by, idempotency_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      eventId,
      card?.cardId || null,
      card?.membershipId || token,
      card?.residentId || null,
      card?.fullName || '',
      direction,
      gate,
      decision,
      reason,
      scanNote,
      isOverride,
      overrideReason,
      req.user.id,
      idempotencyKey,
    ],
  );

  // Notify the card holder that their card was scanned at a security gate
  if (!idempotencyKey) {
    try {
      let notifyUserId = null;
      const allowed = decision === 'ALLOWED' || decision === 'OVERRIDE_ALLOWED';

      if (card?.residentId) {
        // Resident card — look up via Resident table
        const { rows: userRows } = await pool.query(
          `select "userId" from "Resident" where id = $1 limit 1`,
          [card.residentId],
        );
        notifyUserId = userRows[0]?.userId ?? null;
      } else if (card?.accessUserId) {
        // AccessCard holder (merchant / admin / security)
        notifyUserId = card.accessUserId;
      }

      if (notifyUserId) {
        const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await pool.query(
          `insert into "Notification" (id, "userId", type, title, body, "isRead", "createdAt")
           values ($1, $2, $3, $4, $5, false, now())`,
          [
            notifId,
            notifyUserId,
            'CARD_SCANNED_GATE',
            'Card scanned at security gate',
            allowed
              ? `Your card (${card.membershipId}) was scanned for ${direction.toLowerCase()} at ${gate}.`
              : `An attempt to use your card (${card.membershipId}) at ${gate} was denied — ${reason.toLowerCase()}.`,
          ],
        );
      }
    } catch (notifError) {
      // Non-critical — log but don't fail the scan
      console.error('Failed to create scan notification:', notifError);
    }
  }

  // Broadcast live gate event to all authenticated sockets
  io.to('gate-events').emit('gate:event', {
    id: eventId, decision, direction, gate, reason,
    membershipId: card?.membershipId || token,
    residentName: card?.fullName || '',
    scannedAt: new Date().toISOString(),
    isOverride,
  });

  const httpStatus = decision === 'ALLOWED' || decision === 'OVERRIDE_ALLOWED' ? 200 : 403;
  res.status(httpStatus).json({
    eventId,
    decision,
    direction,
    gate,
    reason,
    isOverride,
    member: card
      ? {
          membershipId:  card.membershipId,
          fullName:      card.fullName,
          neighbourhood: card.neighbourhood,
          memberCategory: card.memberCategory,
          cardStatus:    card.cardStatus,
          expiresAt:     card.expiresAt,
        }
      : null,
  });
}));

// ── Visitor code verify ────────────────────────────────────────────────────

app.post('/api/visitor/verify', auth, accessPointOnLocation, asyncRoute(async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      decision: 'DENIED',
      reason: 'Visitor verification requires the shared Neon database.',
      offline: true,
    });
  }

  const code = String(req.body.code || '').trim().toUpperCase();
  const gate = String(req.body.gate || 'Main Gate').trim().slice(0, 80) || 'Main Gate';
  if (!code) return res.status(400).json({ decision: 'DENIED', reason: 'No visitor code provided' });

  const { rows } = await pool.query(
    `select vp.id, vp.code, vp.label, vp."usedAt", vp."expiresAt",
       r.id as "residentId", r."fullName", r.neighbourhood, r."memberCategory"
     from visitor_passes vp
     join "Resident" r on r.id = vp."residentId"
     where upper(vp.code) = upper($1)
     limit 1`,
    [code],
  );

  const pass = rows[0];

  if (!pass) {
    return res.status(403).json({ decision: 'DENIED', reason: 'Visitor code not found' });
  }
  if (pass.usedAt) {
    return res.status(403).json({ decision: 'DENIED', reason: 'Visitor code has already been used', visitorName: pass.label || null });
  }
  if (new Date(pass.expiresAt) < new Date()) {
    return res.status(403).json({ decision: 'DENIED', reason: 'Visitor code has expired', visitorName: pass.label || null });
  }

  // Mark as used
  await pool.query(
    `update visitor_passes set "usedAt" = now() where id = $1`,
    [pass.id],
  );

  // Log access event
  const eventId = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `insert into security_access_events
      (id, resident_id, resident_name, direction, gate, decision, reason, scan_note, is_override, scanned_by)
     values ($1,$2,$3,'ENTRY',$4,'ALLOWED','Visitor pass verified',$5,false,$6)`,
    [eventId, pass.residentId, pass.fullName, gate, pass.label ? `Visitor: ${pass.label}` : 'Visitor pass', req.user.id],
  );

  io.to('gate-events').emit('gate:event', {
    id: eventId, decision: 'ALLOWED', direction: 'ENTRY', gate,
    reason: 'Visitor pass verified',
    membershipId: 'VISITOR',
    residentName: `${pass.fullName} (visitor${pass.label ? `: ${pass.label}` : ''})`,
    scannedAt: new Date().toISOString(),
    isOverride: false,
  });

  res.json({
    decision: 'ALLOWED',
    reason: 'Visitor pass verified — single use consumed',
    gate,
    visitorLabel: pass.label || null,
    residentName: pass.fullName,
    residentNeighbourhood: pass.neighbourhood,
    residentCategory: pass.memberCategory,
  });
}));

// ── Walk-in guest log (Access Point flow) ─────────────────────────────────

// GET /api/merchants/list — list approved merchants for the destination picker
app.get('/api/merchants/list', auth, asyncRoute(async (req, res) => {
  if (!pool) return res.json({ merchants: [] });
  const { rows } = await pool.query(
    `select id, "businessName" as name, category, location
     from "Merchant"
     where "approvalStatus" = 'APPROVED'
     order by "businessName" asc`
  );
  res.json({ merchants: rows });
}));

// POST /api/walkin — log a new walk-in guest
app.post('/api/walkin', auth, accessPointOnLocation, asyncRoute(async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Database required for walk-in logging' });
  const guestName    = String(req.body.guestName || '').trim().slice(0, 120);
  const guestPhone   = String(req.body.guestPhone || '').trim().slice(0, 30) || null;
  const merchantId   = String(req.body.merchantId || '').trim();
  const merchantName = String(req.body.merchantName || '').trim().slice(0, 120);
  const gate         = String(req.body.gate || 'Main Gate').trim().slice(0, 80);
  const notes        = req.body.notes ? String(req.body.notes).trim().slice(0, 300) : null;
  if (!guestName) return res.status(400).json({ message: 'Guest name is required' });
  if (!merchantId) return res.status(400).json({ message: 'Destination merchant is required' });

  const id = `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `insert into walk_in_logs
      (id, guest_name, guest_phone, destination_merchant_id, destination_name, gate, logged_by, notes, entry_time)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
    [id, guestName, guestPhone, merchantId, merchantName, gate, req.user.id, notes],
  );
  const { rows } = await pool.query(`select * from walk_in_logs where id = $1`, [id]);
  const log = rows[0];

  // Push real-time notification to merchant's socket room
  io.to(`merchant:${merchantId}`).emit('walkin:arriving', {
    id: log.id,
    guestName:   log.guest_name,
    guestPhone:  log.guest_phone,
    gate:        log.gate,
    entryTime:   log.entry_time,
    notes:       log.notes,
    merchantId,
  });

  res.json({ walkIn: toWalkIn(log) });
}));

// GET /api/walkin?merchantId= — list active walk-ins (for merchant dashboard)
app.get('/api/walkin', auth, asyncRoute(async (req, res) => {
  if (!pool) return res.json({ walkIns: [] });
  const merchantId = String(req.query.merchantId || '').trim();
  const { rows } = await pool.query(
    `select * from walk_in_logs
     where (destination_merchant_id = $1 or $1 = '')
       and exit_time is null
     order by entry_time desc
     limit 50`,
    [merchantId],
  );
  res.json({ walkIns: rows.map(toWalkIn) });
}));

// POST /api/walkin/:id/acknowledge — merchant acknowledges guest, generates exit code
app.post('/api/walkin/:id/acknowledge', asyncRoute(async (req, res) => {
  // This endpoint is called from the MERCHANT app using the BERA JWT secret
  if (!pool) return res.status(503).json({ message: 'Database required' });
  const beraToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!beraToken) return res.status(401).json({ message: 'Authorization required' });
  let merchantPayload;
  try {
    merchantPayload = jwt.verify(beraToken, process.env.BERA_JWT_SECRET || process.env.JWT_SECRET || secret);
  } catch { return res.status(401).json({ message: 'Invalid or expired merchant session' }); }
  if (merchantPayload.role !== 'MERCHANT') return res.status(403).json({ message: 'Merchant access required' });

  const { id } = req.params;
  const { rows: existing } = await pool.query(`select * from walk_in_logs where id = $1`, [id]);
  if (!existing[0]) return res.status(404).json({ message: 'Walk-in log not found' });
  if (existing[0].acknowledged) return res.json({ walkIn: toWalkIn(existing[0]) }); // idempotent

  // Generate unique 6-digit exit code
  let exitCode;
  for (let i = 0; i < 20; i++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const { rows: clash } = await pool.query(
      `select id from walk_in_logs where exit_code = $1 and exit_time is null`, [candidate]
    );
    if (!clash.length) { exitCode = candidate; break; }
  }
  if (!exitCode) exitCode = String(Date.now()).slice(-6);

  await pool.query(
    `update walk_in_logs
     set acknowledged = true, acknowledged_at = now(), acknowledged_by = $2, exit_code = $3
     where id = $1`,
    [id, merchantPayload.sub, exitCode],
  );

  const { rows } = await pool.query(`select * from walk_in_logs where id = $1`, [id]);
  const log = rows[0];

  // Broadcast to security officers that merchant acknowledged
  io.emit('walkin:acknowledged', {
    id: log.id,
    guestName:  log.guest_name,
    exitCode:   log.exit_code,
    merchantId: log.destination_merchant_id,
    merchantName: log.destination_name,
  });

  res.json({ walkIn: toWalkIn(log) });
}));

// POST /api/walkin/exit — security verifies exit code and marks guest as exited
app.post('/api/walkin/exit', auth, accessPointOnLocation, asyncRoute(async (req, res) => {
  if (!pool) return res.status(503).json({ message: 'Database required' });
  const exitCode = String(req.body.exitCode || '').trim();
  const gate     = String(req.body.gate || 'Main Gate').trim().slice(0, 80);
  if (!exitCode) return res.status(400).json({ message: 'Exit code is required' });

  const { rows } = await pool.query(
    `select * from walk_in_logs where exit_code = $1 limit 1`, [exitCode]
  );
  const log = rows[0];
  if (!log) return res.status(404).json({ decision: 'DENIED', reason: 'Exit code not found or already used' });
  if (!log.acknowledged) return res.status(403).json({ decision: 'DENIED', reason: 'Merchant has not yet acknowledged this guest. Guest cannot exit.' });
  if (log.exit_time) return res.status(409).json({ decision: 'DENIED', reason: 'This exit code has already been used' });

  await pool.query(
    `update walk_in_logs set exit_time = now() where id = $1`, [log.id]
  );

  // Log in access events
  const eventId = `exit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `insert into security_access_events
      (id, resident_name, direction, gate, decision, reason, scan_note, is_override, scanned_by)
     values ($1,$2,'EXIT',$3,'ALLOWED','Walk-in guest exiting',$4,false,$5)`,
    [eventId, log.guest_name, gate, `Visited: ${log.destination_name}`, req.user.id],
  );

  io.to('gate-events').emit('gate:event', {
    id: eventId, decision: 'ALLOWED', direction: 'EXIT', gate,
    reason: `Walk-in guest exiting — visited ${log.destination_name}`,
    membershipId: 'WALK-IN',
    residentName: log.guest_name,
    scannedAt: new Date().toISOString(),
  });

  res.json({
    decision: 'ALLOWED',
    reason:   `${log.guest_name} is cleared to exit`,
    guestName:    log.guest_name,
    destination:  log.destination_name,
    entryTime:    log.entry_time,
    exitTime:     new Date().toISOString(),
  });
}));

const toWalkIn = row => ({
  id:           row.id,
  guestName:    row.guest_name,
  guestPhone:   row.guest_phone || null,
  merchantId:   row.destination_merchant_id,
  merchantName: row.destination_name,
  gate:         row.gate,
  loggedBy:     row.logged_by,
  entryTime:    row.entry_time?.toISOString?.() || row.entry_time,
  exitTime:     row.exit_time?.toISOString?.() || null,
  exitCode:     row.exit_code || null,
  acknowledged: row.acknowledged || false,
  acknowledgedAt: row.acknowledged_at?.toISOString?.() || null,
  notes:        row.notes || null,
});

app.post('/api/users', auth, asyncRoute(async (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: 'Access denied' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role || 'Access Point';
  const rank = role;
  if (!req.body.name || !email || !req.body.password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (!canCreateUser(req.user, rank, role)) return res.status(403).json({ message: 'You do not have permission to create that role' });
  if ((await store.users()).some(user => user.email.toLowerCase() === email)) return res.status(409).json({ message: 'An account with that email already exists' });
  const user = {
    id: `u${Date.now()}`,
    name: String(req.body.name).trim(), email,
    password: await bcrypt.hash(req.body.password, 10),
    role, rank,
    active: true,
    unit: String(req.body.unit || 'Bodija Gate').trim().slice(0, 100),
    unitType: 'Gate',
    command: 'Bodija Community',
    division: '',
    station: '',
    lga: '',
    lat: Number.isFinite(Number(req.body.lat)) ? Number(req.body.lat) : 7.3775,
    lng: Number.isFinite(Number(req.body.lng)) ? Number(req.body.lng) : 3.9470,
  };
  const created = await store.createUser(user);
  io.emit('user:created', publicUser(created));
  res.status(201).json(publicUser(created));
}));
app.delete('/api/users/:id', auth, asyncRoute(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account' });
  const target = (await store.users()).find(user => user.id === req.params.id);
  if (!canDeleteUser(req.user, target)) return res.status(403).json({ message: 'You are not allowed to delete this account' });
  const deleted = await store.deleteUser(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Officer not found' });
  io.emit('user:deleted', req.params.id);
  res.status(204).end();
}));
app.put('/api/users/:id/password', auth, asyncRoute(async (req, res) => {
  const target = (await store.users()).find(user => user.id === req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (req.user.id !== target.id && req.user.role !== 'Super Admin' && !canManageRank(req.user.rank, target.rank)) return res.status(403).json({ message: 'You can only change passwords for lower ranks' });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  await store.updateUserPassword(req.params.id, await bcrypt.hash(password, 10));
  res.json({ ok: true });
}));
app.get('/api/incidents', auth, asyncRoute(async (req, res) => res.json((await store.incidents()).filter(incident => canAccessIncident(req.user, incident)))));
app.post('/api/incidents', auth, asyncRoute(async (req, res) => {
  const visibleTo = [...new Set([
    ...(Array.isArray(req.body.visibleTo) ? req.body.visibleTo : []),
    ...(isSosIncident(req.body) ? sosVisibleTo({ ...req.user, userId: req.user.id, ...req.body }) : []),
    req.body.assignedTo
  ].filter(Boolean))];
  const incident = { ...req.body, visibleTo, media: Array.isArray(req.body.media) ? req.body.media.slice(0, 6) : [], id: `i${Date.now()}`, createdAt: new Date().toISOString(), createdBy: req.user.id };
  const created = await store.createIncident(incident);
  io.emit('incident:created', created);
  res.status(201).json(created);
}));
app.put('/api/incidents/:id', auth, asyncRoute(async (req, res) => {
  const current = (await store.incidents()).find(item => item.id === req.params.id);
  if (!current || !canAccessIncident(req.user, current)) return res.status(404).json({ message: 'Incident not found' });
  const incident = await store.updateIncident(req.params.id, req.body);
  if (!incident) return res.status(404).json({ message: 'Incident not found' });
  io.emit('incident:updated', incident);
  res.json(incident);
}));
app.delete('/api/incidents/:id', auth, adminOnly, asyncRoute(async (req, res) => { await store.deleteIncident(req.params.id); io.emit('incident:deleted', req.params.id); res.status(204).end(); }));
app.post('/api/incidents/:id/chat', auth, asyncRoute(async (req, res) => {
  const incident = (await store.incidents()).find(item => item.id === req.params.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found' });
  if (!canAccessIncident(req.user, incident)) return res.status(403).json({ message: 'Only assigned viewers and command can open this incident chat' });
  const room = await store.incidentChatRoom(incident, req.user);
  io.emit('chat:room', room);
  res.json(room);
}));
app.get('/api/cameras', auth, asyncRoute(async (_, res) => res.json(await store.cameras())));
app.post('/api/cameras', auth, adminOnly, asyncRoute(async (req, res) => {
  if (!req.body.name || !req.body.url) return res.status(400).json({ message: 'Camera name and stream URL are required' });
  const camera = { id: `cam-${Date.now()}`, name: req.body.name, type: req.body.type || 'CCTV', url: req.body.url, lat: Number(req.body.lat) || 7.3775, lng: Number(req.body.lng) || 3.9470, status: 'Online', createdAt: new Date().toISOString() };
  const created = await store.createCamera(camera);
  io.emit('camera:created', created);
  res.status(201).json(created);
}));
app.delete('/api/cameras/:id', auth, adminOnly, asyncRoute(async (req, res) => { await store.deleteCamera(req.params.id); io.emit('camera:deleted', req.params.id); res.status(204).end(); }));
app.get('/api/map-layers', auth, asyncRoute(async (_, res) => res.json(await store.mapLayers())));
app.post('/api/map-layers', auth, superAdminOnly, asyncRoute(async (req, res) => {
  if (!req.body.name || !req.body.type) return res.status(400).json({ message: 'Layer name and type are required' });
  const layer = { id: `layer-${Date.now()}`, name: String(req.body.name).trim(), type: req.body.type, data: req.body.data || null, url: req.body.url || '', bounds: req.body.bounds || null, opacity: Number(req.body.opacity) || 0.65, fillOpacity: Number(req.body.fillOpacity ?? 0.18), category: req.body.category || (req.body.type === 'raster' ? 'Raster' : 'Point'), operationalUse: req.body.operationalUse || 'Reference', color: req.body.color || '#facc15', fillColor: req.body.fillColor || req.body.color || '#f59e0b', lineWeight: Number(req.body.lineWeight) || 2, lineStyle: req.body.lineStyle || 'solid', pointIcon: req.body.pointIcon || 'pin', pointIconColor: req.body.pointIconColor || '#ffffff', pointSize: Number(req.body.pointSize) || 24, showLabels: req.body.showLabels ?? true, labelField: req.body.labelField || 'name', popupFields: req.body.popupFields || '', visible: req.body.visible ?? true, zIndex: Number(req.body.zIndex) || 0, createdAt: new Date().toISOString() };
  const created = await store.createMapLayer(layer);
  io.emit('map-layer:created', created);
  res.status(201).json(created);
}));
app.put('/api/map-layers/:id', auth, asyncRoute(async (req, res) => {
  const allowedKeys = isAdminRole(req.user) ? ['visible', 'opacity', 'fillOpacity', 'color', 'fillColor', 'lineWeight', 'lineStyle', 'pointIcon', 'pointIconColor', 'pointSize', 'showLabels', 'labelField', 'popupFields', 'category', 'operationalUse', 'name', 'zIndex'] : ['visible'];
  const changes = {};
  for (const key of allowedKeys) {
    if (req.body[key] === undefined) continue;
    changes[key] = ['opacity', 'fillOpacity', 'lineWeight', 'pointSize', 'zIndex'].includes(key) ? Number(req.body[key]) : req.body[key];
  }
  if (!Object.keys(changes).length) return res.status(400).json({ message: 'No permitted layer changes supplied' });
  const updated = await store.updateMapLayer(req.params.id, changes);
  if (!updated) return res.status(404).json({ message: 'Map layer not found' });
  io.emit('map-layer:updated', updated);
  res.json(updated);
}));
app.delete('/api/map-layers/:id', auth, superAdminOnly, asyncRoute(async (req, res) => { await store.deleteMapLayer(req.params.id); io.emit('map-layer:deleted', req.params.id); res.status(204).end(); }));
app.get('/api/chat/rooms', auth, asyncRoute(async (req, res) => res.json(await store.chatRooms(req.user))));
app.post('/api/chat/rooms', auth, asyncRoute(async (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: 'You do not have lower ranks to manage' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Room name is required' });
  const allowedUsers = visibleUsersFor(req.user, await store.users());
  const allowedIds = new Set(allowedUsers.map(user => user.id));
  const memberIds = (Array.isArray(req.body.memberIds) ? req.body.memberIds : [req.body.userId]).filter(id => id && allowedIds.has(id));
  const room = await store.createChatRoom({ id: `room-${Date.now()}`, name, type: 'room', incidentId: '', createdBy: req.user.id, createdAt: new Date().toISOString() }, memberIds);
  io.emit('chat:room', room);
  res.status(201).json(room);
}));
app.post('/api/chat/rooms/:id/members', auth, asyncRoute(async (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: 'You do not have lower ranks to manage' });
  const room = await store.chatRoom(req.params.id);
  if (!room) return res.status(404).json({ message: 'Chat room not found' });
  const target = (await store.users()).find(user => user.id === req.body.userId);
  if (!target || !visibleUsersFor(req.user, [target]).length) return res.status(403).json({ message: 'You cannot add this user to the chat' });
  const updated = await store.addChatMember(req.params.id, target.id);
  io.emit('chat:room', updated);
  res.json(updated);
}));
app.delete('/api/chat/rooms/:id', auth, asyncRoute(async (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: 'You do not have lower ranks to manage' });
  const room = await store.chatRoom(req.params.id);
  if (!room) return res.status(404).json({ message: 'Chat room not found' });
  const deleted = await store.deleteChatRoom(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Chat room not found' });
  io.emit('chat:deleted', req.params.id);
  res.status(204).end();
}));
app.get('/api/chat/rooms/:id/messages', auth, asyncRoute(async (req, res) => {
  const room = await store.chatRoom(req.params.id);
  if (!canAccessRoom(req.user, room)) return res.status(403).json({ message: 'You cannot view this chat' });
  res.json(await store.chatMessages(req.params.id));
}));
app.post('/api/chat/rooms/:id/messages', auth, asyncRoute(async (req, res) => {
  const room = await store.chatRoom(req.params.id);
  if (!canAccessRoom(req.user, room)) return res.status(403).json({ message: 'You cannot send to this chat' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ message: 'Message cannot be empty' });
  const message = await store.createChatMessage({ id: `msg-${Date.now()}`, roomId: req.params.id, senderId: req.user.id, body, createdAt: new Date().toISOString() });
  io.emit('chat:message', { roomId: req.params.id, message });
  res.status(201).json(message);
}));
app.post('/api/gps/ping', (req, res) => { io.emit('gps:broadcast', req.body); res.json({ received: true }); });

// Socket.IO authentication middleware — all events require a valid JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.data.user = jwt.verify(token, secret);
    next();
  } catch {
    next(new Error('Session expired. Reconnect to continue.'));
  }
});

io.on('connection', socket => {
  const user = socket.data.user;

  // Join gate-events room — all authenticated SIGAR users receive live gate events
  socket.join('gate-events');

  // Merchant portal clients register to receive walk-in notifications for their merchant
  socket.on('merchant:register', ({ merchantId }) => {
    if (merchantId) socket.join(`merchant:${merchantId}`);
  });

  // GPS updates — identify the sending user
  socket.on('gps:update', point => {
    const authenticatedUserId = userIdOf(user);
    const gpsPoint = { ...point, userId: authenticatedUserId, lat: Number(point.lat), lng: Number(point.lng), accuracy: Number(point.accuracy), receivedAt: Date.now(), timestamp: point.timestamp || new Date().toISOString() };
    socket.data.user = { ...user, userId: authenticatedUserId, lat: gpsPoint.lat, lng: gpsPoint.lng };
    if (user?.role === 'Access Point' && Number.isFinite(gpsPoint.lat) && Number.isFinite(gpsPoint.lng)) accessPointGps.set(authenticatedUserId, gpsPoint);
    io.emit('gps:broadcast', gpsPoint);
  });
  socket.on('gps:stop', () => {
    const authenticatedUserId = userIdOf(user);
    accessPointGps.delete(authenticatedUserId);
    io.emit('gps:offline', { userId: authenticatedUserId, timestamp: new Date().toISOString() });
  });

  // Emergency alerts — only emit to authorized listeners
  socket.on('emergency:send', alert => emitEmergencyAlert(socket, { ...(socket.data.user || {}), ...alert }));

  // Camera sharing — join user-specific room for targeted signal routing
  socket.on('camera:register', regUser => {
    socket.data.cameraUser = { userId: regUser.userId, name: regUser.name, role: regUser.role };
    socket.data.user = { ...(socket.data.user || {}), ...regUser, lat: Number(socket.data.user?.lat ?? regUser.lat), lng: Number(socket.data.user?.lng ?? regUser.lng) };
    socket.join(`camera:user:${regUser.userId}`);
    if (isAdminRole(regUser)) socket.emit('camera:shares:list', [...activeCameraShares.values()]);
  });
  socket.on('camera:share:start', payload => { activeCameraShares.set(payload.userId, payload); socket.broadcast.emit('camera:share:start', payload); });
  socket.on('camera:share:stop', payload => { activeCameraShares.delete(payload.userId); socket.broadcast.emit('camera:share:stop', payload); });
  socket.on('camera:view:request', ({ officerId }) => io.to(`camera:user:${officerId}`).emit('camera:viewer:request', { viewerSocketId: socket.id }));
  socket.on('camera:signal', ({ target, data }) => {
    // Only route signals if the target socket is in the expected camera room
    io.to(target).emit('camera:signal', { from: socket.id, fromUserId: socket.data.cameraUser?.userId, fromName: socket.data.cameraUser?.name, data });
  });

  socket.on('disconnect', () => {
    if (user?.role === 'Access Point') accessPointGps.delete(userIdOf(user));
    const camUser = socket.data.cameraUser;
    if (camUser?.role === 'Officer' && activeCameraShares.has(camUser.userId)) {
      activeCameraShares.delete(camUser.userId);
      socket.broadcast.emit('camera:share:stop', { userId: camUser.userId });
    }
  });
});

app.use((err, _, res, __) => {
  console.error(err);
  res.status(500).json({ message: 'Server error. Please check logs.' });
});

if (process.env.NODE_ENV === 'production') { app.use(express.static(join(__dirname, '..', 'dist'))); app.get(/.*/, (_, res) => res.sendFile(join(__dirname, '..', 'dist', 'index.html'))); }
server.listen(process.env.PORT || 5000, '0.0.0.0', () => console.log(`SIGAR Bodija Security API listening on port ${process.env.PORT || 5000}`));
