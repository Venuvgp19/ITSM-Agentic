import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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

const defaultDepartments = ['Unix', 'Network Ops', 'App Support', 'Desktop Support', 'DevOps Ops', 'SecOps', 'DBA Team', 'IT Ops'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAllUsers(tenantId: string) {
    return allAssignedUsers;
  }

  async getDepartments() {
    return defaultDepartments;
  }

  async createUser(dto: any) {
    const newUser = {
      id: `u_${Date.now()}`,
      name: `${dto.firstName} ${dto.lastName}`,
      email: dto.email,
      role: dto.role || 'Service Desk Agent',
      department: dto.department || 'Unix',
      status: 'ACTIVE',
      mfa: false,
    };
    allAssignedUsers.unshift(newUser);
    return newUser;
  }
}
