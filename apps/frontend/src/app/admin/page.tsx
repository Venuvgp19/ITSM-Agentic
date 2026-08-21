'use client';

import React, { useState, useMemo } from 'react';
import {
  Settings,
  ShieldCheck,
  Key,
  Lock,
  Users,
  Plus,
  Trash2,
  UserPlus,
  Mail,
  Building,
  CheckCircle2,
  XCircle,
  ChevronRight,
  X,
  Filter,
  Search,
  Tag,
  Shield,
  Activity
} from 'lucide-react';

export const allAssignedUsers = [
  { id: 'usr_venu', name: 'Venu', email: 'venu@service-now.com', role: 'Global Administrator & SRE Lead', department: 'IT Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_admin', name: 'System Admin', email: 'admin@acme.com', role: 'Global Administrator', department: 'IT Ops', status: 'ACTIVE', mfa: true },

  // Unix Assignment Group
  { id: 'usr_u1', name: 'Richard Stallman', email: 'r.stallman@acme.com', role: 'Principal Unix Kernel SRE', department: 'Unix', status: 'ACTIVE', mfa: true },
  { id: 'usr_u2', name: 'Linus Torvalds', email: 'l.torvalds@acme.com', role: 'Linux Kernel Lead Architect', department: 'Unix', status: 'ACTIVE', mfa: true },
  { id: 'usr_u3', name: 'Ken Thompson', email: 'k.thompson@acme.com', role: 'Operating Systems Architect', department: 'Unix', status: 'ACTIVE', mfa: false },
  { id: 'usr_u4', name: 'Dennis Ritchie', email: 'd.ritchie@acme.com', role: 'Senior Systems Engineer', department: 'Unix', status: 'ACTIVE', mfa: true },

  // Network Ops Assignment Group
  { id: 'usr_n1', name: 'Sarah Connor', email: 's.connor@acme.com', role: 'Network Operations Lead', department: 'Network Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_n2', name: 'Vint Cerf', email: 'v.cerf@acme.com', role: 'Chief Network Protocol SRE', department: 'Network Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_n3', name: 'Radia Perlman', email: 'r.perlman@acme.com', role: 'Routing & Spanning Tree Specialist', department: 'Network Ops', status: 'ACTIVE', mfa: false },
  { id: 'usr_n4', name: 'Bob Kahn', email: 'b.kahn@acme.com', role: 'Network Infrastructure SRE', department: 'Network Ops', status: 'ACTIVE', mfa: false },

  // App Support Assignment Group
  { id: 'usr_a1', name: 'Alex Mercer', email: 'a.mercer@acme.com', role: 'Application Support Lead', department: 'App Support', status: 'ACTIVE', mfa: true },
  { id: 'usr_a2', name: 'Ada Lovelace', email: 'a.lovelace@acme.com', role: 'Senior Logic & App SRE', department: 'App Support', status: 'ACTIVE', mfa: true },
  { id: 'usr_a3', name: 'Grace Hopper', email: 'g.hopper@acme.com', role: 'Compiler & Runtime Architect', department: 'App Support', status: 'ACTIVE', mfa: true },
  { id: 'usr_a4', name: 'Margaret Hamilton', email: 'm.hamilton@acme.com', role: 'Mission-Critical Software Lead', department: 'App Support', status: 'ACTIVE', mfa: true },

  // Desktop Support Assignment Group
  { id: 'usr_d1', name: 'David Miller', email: 'd.miller@acme.com', role: 'Service Desk Lead', department: 'Desktop Support', status: 'ACTIVE', mfa: false },
  { id: 'usr_d2', name: 'Alan Turing', email: 'a.turing@acme.com', role: 'Computational Systems Engineer', department: 'Desktop Support', status: 'ACTIVE', mfa: true },
  { id: 'usr_d3', name: 'Tim Berners-Lee', email: 't.bernerslee@acme.com', role: 'End-User Connectivity Specialist', department: 'Desktop Support', status: 'ACTIVE', mfa: false },
  { id: 'usr_d4', name: 'John von Neumann', email: 'j.vonneumann@acme.com', role: 'Enterprise Hardware Architect', department: 'Desktop Support', status: 'ACTIVE', mfa: true },

  // DBA Team Assignment Group
  { id: 'usr_db1', name: 'Edgar Codd', email: 'e.codd@acme.com', role: 'Relational Database Architect', department: 'DBA Team', status: 'ACTIVE', mfa: true },
  { id: 'usr_db2', name: 'Michael Stonebraker', email: 'm.stonebraker@acme.com', role: 'PostgreSQL & High-Load DBA Lead', department: 'DBA Team', status: 'ACTIVE', mfa: true },
  { id: 'usr_db3', name: 'Jim Gray', email: 'j.gray@acme.com', role: 'Distributed Transactions Specialist', department: 'DBA Team', status: 'ACTIVE', mfa: false },
  { id: 'usr_db4', name: 'Larry Ellison', email: 'l.ellison@acme.com', role: 'Enterprise Database SRE', department: 'DBA Team', status: 'ACTIVE', mfa: true },

  // SecOps Assignment Group
  { id: 'usr_s1', name: 'Bruce Schneier', email: 'b.schneier@acme.com', role: 'Principal Cryptography & SecOps Lead', department: 'SecOps', status: 'ACTIVE', mfa: true },
  { id: 'usr_s2', name: 'Gene Spafford', email: 'g.spafford@acme.com', role: 'Cybersecurity Incident Response SRE', department: 'SecOps', status: 'ACTIVE', mfa: true },
  { id: 'usr_s3', name: 'Whitfield Diffie', email: 'w.diffie@acme.com', role: 'PKI & Identity Auth Specialist', department: 'SecOps', status: 'ACTIVE', mfa: false },
  { id: 'usr_s4', name: 'Dorothy Denning', email: 'd.denning@acme.com', role: 'Intrusion Detection & Defense SRE', department: 'SecOps', status: 'ACTIVE', mfa: true },

  // DevOps Ops Assignment Group
  { id: 'usr_do1', name: 'Kelsey Hightower', email: 'k.hightower@acme.com', role: 'Principal Kubernetes Architect', department: 'DevOps Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_do2', name: 'Brendan Burns', email: 'b.burns@acme.com', role: 'Cloud Infrastructure & SRE Lead', department: 'DevOps Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_do3', name: 'Werner Vogels', email: 'w.vogels@acme.com', role: 'Distributed Cloud Reliability Lead', department: 'DevOps Ops', status: 'ACTIVE', mfa: true },
  { id: 'usr_do4', name: 'Adrian Cockcroft', email: 'a.cockcroft@acme.com', role: 'Microservices & Platform Architect', department: 'DevOps Ops', status: 'ACTIVE', mfa: false },
];

const rbacRoles = [
  { name: 'Global Administrator', users: 3, permissions: 'All Permissions (*:*)', isSystem: true },
  { name: 'Principal SRE & Architect', users: 12, permissions: 'incident:*, problem:*, change:*, sop:*', isSystem: false },
  { name: 'ITIL Incident Manager', users: 8, permissions: 'incident:*, sla:read, task:*', isSystem: false },
  { name: 'Change Advisory Board (CAB)', users: 6, permissions: 'change:*, approval:*', isSystem: false },
  { name: 'Service Desk Agent', users: 4, permissions: 'incident:read, incident:create, catalog:read', isSystem: false },
];

const departments = ['ALL', 'IT Ops', 'Unix', 'Network Ops', 'App Support', 'Desktop Support', 'DevOps Ops', 'SecOps', 'DBA Team'];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'rbac' | 'security'>('users');
  const [users, setUsers] = useState(allAssignedUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Senior Systems Engineer');
  const [department, setDepartment] = useState('Unix');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q);

      const matchesDept = selectedDept === 'ALL' || u.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [users, searchTerm, selectedDept]);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName) return;

    const newUser = {
      id: `usr_${Date.now()}`,
      name: `${firstName} ${lastName}`.trim(),
      email,
      role,
      department,
      status: 'ACTIVE',
      mfa: false,
    };

    setUsers([newUser, ...users]);
    setFirstName('');
    setLastName('');
    setEmail('');
    setIsAddUserModalOpen(false);
  };

  const handleDeleteUser = (id: string) => {
    if (confirm('Are you sure you want to remove this user account?')) {
      setUsers(users.filter((u) => u.id !== id));
    }
  };

  const toggleUserStatus = (id: string) => {
    setUsers(
      users.map((u) =>
        u.id === id ? { ...u, status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } : u
      )
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans text-xs">
      {/* 1. Context Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Service Management</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">System Administration</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-900 font-extrabold flex items-center gap-1.5">
            User Accounts & Team Members
            <span className="px-1.5 py-0.2 rounded bg-[#e6f7ef] text-[#1e6844] font-mono text-[10px] font-bold border border-[#30bb7b]/30">
              sys_user ({users.length} Engineers)
            </span>
          </span>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="px-3 py-1.5 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs text-xs self-start md:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>New User</span>
          </button>
        )}
      </div>

      {/* 2. Navigation Tabs */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 flex items-center gap-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab('users')}
          className={`py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'border-[#30bb7b] text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-[#30bb7b]" />
          <span>User Accounts ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rbac')}
          className={`py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'rbac'
              ? 'border-[#30bb7b] text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Roles & Permissions (RBAC)</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'security'
              ? 'border-[#30bb7b] text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Security & Instance Controls</span>
        </button>
      </div>

      {/* 3. Main Content View */}
      <div className="flex-1 p-5 overflow-y-auto max-w-7xl mx-auto w-full space-y-4">
        {activeTab === 'users' && (
          <div className="space-y-3">
            {/* Filter & Search Bar */}
            <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#288554]" />
                  <span className="font-bold text-slate-700">Assignment Group:</span>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="bg-white border border-[#cbd5e1] text-slate-800 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-[#288554] font-medium"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d === 'ALL' ? 'All Assignment Groups' : d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search user name, email, role..."
                  className="bg-white border border-[#cbd5e1] focus:border-[#288554] rounded pl-8 pr-3 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none w-64 transition"
                />
              </div>
            </div>

            {/* High-Contrast ServiceNow Table */}
            <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#cbd5e1] text-slate-700 font-bold text-[11px]">
                    <th className="p-3">User ID</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Corporate Email</th>
                    <th className="p-3">Assignment Group</th>
                    <th className="p-3">Enterprise Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">MFA</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {filteredUsers.map((user, idx) => (
                    <tr
                      key={user.id}
                      className={`transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'
                      } hover:bg-[#e6f0f2]`}
                    >
                      <td className="p-3 font-mono font-bold text-[#0284c7]">{user.id}</td>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#288554] text-white font-bold text-[10px] flex items-center justify-center">
                          {user.name.charAt(0)}
                        </div>
                        <span>{user.name}</span>
                        {user.name === 'Venu' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-[11px]">{user.email}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {user.department}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800 font-medium">{user.role}</td>
                      <td className="p-3">
                        <span
                          onClick={() => toggleUserStatus(user.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                            user.status === 'ACTIVE'
                              ? 'bg-[#e6f7ef] text-[#1e6844] border border-[#30bb7b]/30'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {user.mfa ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Disabled</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {user.id !== 'usr_venu' && user.id !== 'usr_admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'rbac' && (
          <div className="space-y-4 bg-white border border-[#e2e8f0] rounded p-5 shadow-xs">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Role-Based Access Control (RBAC)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage permissions and functional access across ITIL modules.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {rbacRoles.map((role) => (
                <div key={role.name} className="p-4 rounded border border-[#cbd5e1] bg-[#f8fafc] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-xs">{role.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">{role.users} Active Users</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700 bg-white p-2 rounded border border-[#e2e8f0]">
                    {role.permissions}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-4 bg-white border border-[#e2e8f0] rounded p-5 shadow-xs">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Instance Security & Session Policy</h3>
              <p className="text-xs text-slate-500 mt-0.5">Control Tower session timeout, mutual TLS, and cryptographic token verification.</p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs flex items-center justify-between font-medium">
                <span>Autonomous ReAct SSH Whitelist Policy</span>
                <span className="font-bold font-mono">ENFORCED (Strict CI Host Matching)</span>
              </div>

              <div className="p-3 rounded border border-blue-200 bg-blue-50 text-blue-900 text-xs flex items-center justify-between font-medium">
                <span>JWT Token Lifetime</span>
                <span className="font-bold font-mono">8 Hours (HS256 HMAC)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-[#1a2c30] text-white px-5 py-3.5 flex items-center justify-between">
              <span className="font-extrabold text-sm">Create New User Account (sys_user)</span>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="p-1 rounded text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4 text-xs bg-[#f8fafc]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Corporate Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Assignment Group</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none font-bold"
                >
                  {departments.filter(d => d !== 'ALL').map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-white border border-[#cbd5e1] rounded p-2 text-xs text-slate-900 focus:border-[#288554] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded bg-[#288554] hover:bg-[#30bb7b] text-white font-bold transition shadow-sm cursor-pointer"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
