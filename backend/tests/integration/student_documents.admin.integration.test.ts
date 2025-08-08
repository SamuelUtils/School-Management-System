// tests/integration/student_documents.admin.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, Gender } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { StudentDocumentMetadata } from '@/models/student.types';
import { Prisma } from '@prisma/client';

describe('Admin Student Document Management API Endpoints (/api/admin/students/:id/docs)', () => {
    let adminUser: any;
    const adminPassword = 'DocAdminPassword123!';
    let adminAuthToken: string;
    let testStudent: any;

    beforeAll(async () => {
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        const hashedAdminPassword = await hashPassword(adminPassword);
        adminUser = await prisma.user.create({
            data: {
                name: 'Document Admin',
                phone: 'doc_admin@example.com',
                role: Role.ADMIN,
                passwordHash: hashedAdminPassword,
            },
        });
        const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: adminPassword });
        adminAuthToken = adminLoginRes.body.token;
        if (!adminAuthToken) throw new Error('Failed to get admin token for document tests');

        // Create a student for testing
        testStudent = await prisma.student.create({
            data: {
                name: 'Student With Docs',
                admissionNumber: `DOCADM-${Date.now()}`,
                currentClass: 'Grade 7',
            }
        });
    });

    afterAll(async () => {
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
    });

    describe('POST /api/admin/students/:id/upload-docs', () => {
        it('should successfully add document metadata to a student', async () => {
            const newDocsPayload: { documents: StudentDocumentMetadata[] } = {
                documents: [
                    { name: 'Birth Certificate', url: 'placeholder:/docs/bc.pdf', uploadedAt: new Date().toISOString(), fileType: 'pdf' },
                    { name: 'Photo ID', url: 'stub://local/photo.jpg', uploadedAt: new Date().toISOString(), size: 102400 },
                ]
            };

            const response = await request(app)
                .post(`/api/admin/students/${testStudent.id}/upload-docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(newDocsPayload);

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Document metadata successfully added');
            expect(response.body.studentId).toBe(testStudent.id);
            expect(Array.isArray(response.body.documents)).toBe(true);
            expect(response.body.documents.length).toBe(2);
            expect(response.body.documents[0].name).toBe('Birth Certificate');
            expect(response.body.documents[1].url).toBe('stub://local/photo.jpg');

            const dbStudent = await prisma.student.findUnique({ where: { id: testStudent.id } });
            const dbDocs = dbStudent?.documents as StudentDocumentMetadata[] | null;
            expect(dbDocs).not.toBeNull();
            expect(dbDocs?.length).toBe(2);
            expect(dbDocs?.[0].name).toBe('Birth Certificate');
        });

        it('should append new documents to existing ones', async () => {
            // First, add initial docs (already done by the previous test if run in sequence,
            // but for isolation, let's assume a clean state or re-add)
            await prisma.student.update({
                where: { id: testStudent.id },
                data: {
                    documents: [
                        { name: 'Initial Doc', url: 'placeholder:/initial.doc', uploadedAt: new Date().toISOString() }
                    ] as any
                } // Cast to any or Prisma.JsonArray
            });


            const additionalDocsPayload = {
                documents: [
                    { name: 'Vaccination Record', url: 'placeholder:/vaccine.pdf', uploadedAt: new Date().toISOString() }
                ]
            };
            const response = await request(app)
                .post(`/api/admin/students/${testStudent.id}/upload-docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(additionalDocsPayload);

            expect(response.status).toBe(200);
            expect(response.body.documents.length).toBe(2); // Initial Doc + Vaccination Record
            expect(response.body.documents.find((d: StudentDocumentMetadata) => d.name === 'Initial Doc')).toBeDefined();
            expect(response.body.documents.find((d: StudentDocumentMetadata) => d.name === 'Vaccination Record')).toBeDefined();
        });


        it('should return 404 if student not found', async () => {
            const payload = { documents: [{ name: 'Test', url: 'placeholder:/test.doc', uploadedAt: new Date().toISOString() }] };
            const response = await request(app)
                .post(`/api/admin/students/non-existent-student-id/upload-docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);
            expect(response.status).toBe(404);
        });

        it('should return 400 if documents array is not provided or malformed', async () => {
            const response1 = await request(app)
                .post(`/api/admin/students/${testStudent.id}/upload-docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send({ files: [] }); // Incorrect payload key
            expect(response1.status).toBe(400);
            expect(response1.body.message).toBe('Documents field must be an array.');

            const response2 = await request(app)
                .post(`/api/admin/students/${testStudent.id}/upload-docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send({ documents: [{ name: 'Missing URL', uploadedAt: new Date().toISOString() }] }); // Missing URL
            expect(response2.status).toBe(400);
            expect(response2.body.message).toContain('Each document must have a name, url, and uploadedAt');
        });

        it('should return 403 Forbidden if non-admin tries to upload', async () => {
            const nonAdminUser = await prisma.user.create({ data: { name: 'NonAdminDoc', phone: 'nonadmindoc@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
            const nonAdminLogin = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: 'pass' });
            const nonAdminToken = nonAdminLogin.body.token;

            const payload = { documents: [{ name: 'Test', url: 'placeholder:/test.doc', uploadedAt: new Date().toISOString() }] };
            const response = await request(app)
                .post(`/api/admin/students/${testStudent.id}/upload-docs`)
                .set('Authorization', `Bearer ${nonAdminToken}`)
                .send(payload);
            expect(response.status).toBe(403);
            await prisma.user.delete({ where: { id: nonAdminUser.id } });
        });
    });

    describe('GET /api/admin/students/:id/docs', () => {
        beforeAll(async () => {
            // Ensure student has some documents for get test
            await prisma.student.update({
                where: { id: testStudent.id },
                data: {
                    documents: [
                        { name: 'Report Card Q1', url: 'placeholder:/reports/q1.pdf', uploadedAt: new Date(2023, 0, 15).toISOString() },
                        { name: 'Permission Slip', url: 'stub://trip/permission.docx', uploadedAt: new Date(2023, 1, 10).toISOString() }
                    ] as any // Cast to any or Prisma.JsonArray
                }
            });
        });

        it('should retrieve all document metadata for a student', async () => {
            const response = await request(app)
                .get(`/api/admin/students/${testStudent.id}/docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`);

            expect(response.status).toBe(200);
            expect(response.body.studentId).toBe(testStudent.id);
            expect(Array.isArray(response.body.documents)).toBe(true);
            expect(response.body.documents.length).toBe(2);
            expect(response.body.documents[0].name).toBe('Report Card Q1');
            expect(response.body.documents[1].url).toBe('stub://trip/permission.docx');
            expect(response.body._note).toBeDefined();
        });

        it('should return an empty document list if student has no documents', async () => {
            // Create a student with no documents
            const studentNoDocs = await prisma.student.create({
                data: {
                    name: 'No Docs Student',
                    admissionNumber: `NODOC${Date.now()}`,
                    currentClass: 'Grade 1',
                    documents: Prisma.JsonNull
                }
            });
            const response = await request(app)
                .get(`/api/admin/students/${studentNoDocs.id}/docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`);

            expect(response.status).toBe(200);
            expect(response.body.documents).toEqual([]);
            await prisma.student.delete({ where: { id: studentNoDocs.id } });
        });

        it('should return 404 if student not found for getting docs', async () => {
            const response = await request(app)
                .get(`/api/admin/students/non-existent-student-id/docs`)
                .set('Authorization', `Bearer ${adminAuthToken}`);
            expect(response.status).toBe(404);
        });
    });
});