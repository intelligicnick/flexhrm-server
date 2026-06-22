import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  EmployeeDataGatherLink,
  EmployeeDataGatherLinkDocument,
} from '../../database/schemas/employee-data-gather-link.schema';
import { EmployeesService } from './employees.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeChangeRequestsService } from './employee-change-requests.service';
import {
  DATA_GATHER_LINK_TTL_MS,
  DATA_GATHER_SESSION_TTL_MS,
  EMPLOYEE_FIELD_LABELS,
  EMPLOYEE_SELF_SERVICE_FIELDS,
  EmployeeSelfServiceField,
  PASSPORT_PHOTO_LABEL,
  REQUIRED_DOCUMENT_LABELS,
} from './employee-data-gather.constants';
import {
  generateResetCode,
  generateToken,
  hashPassword,
  verifyPassword,
} from '../../common/utils/password.util';
import { employeeDisplayName } from '../../common/utils/audit-log-format.util';
import { SubmitDataGatherDocumentDto } from './dto/employee-data-gather.dto';

function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return !value.trim();
  if (typeof value === 'number') return value === 0;
  return false;
}

function normalizeDocLabel(label: string): string {
  return label.trim().toLowerCase();
}

function hasEmployeePhoto(employee: Record<string, unknown>): boolean {
  const photo = String(employee.photo || '').trim();
  const photoUrl = String(employee.photoUrl || '').trim();
  const photoDataBase64 = String(employee.photoDataBase64 || '').trim();
  return Boolean(photo || photoUrl || photoDataBase64);
}

@Injectable()
export class EmployeeDataGatherService {
  constructor(
    @InjectModel(EmployeeDataGatherLink.name)
    private readonly linkModel: Model<EmployeeDataGatherLinkDocument>,
    private readonly employeesService: EmployeesService,
    private readonly employeeDocumentsService: EmployeeDocumentsService,
    private readonly changeRequestsService: EmployeeChangeRequestsService,
  ) {}

  private async expireStaleLinks(): Promise<void> {
    await this.linkModel.updateMany(
      {
        status: 'active',
        expiresAt: { $lt: new Date() },
      },
      { $set: { status: 'expired' } },
    );
  }

  detectBlankFields(employee: Record<string, unknown>): EmployeeSelfServiceField[] {
    return EMPLOYEE_SELF_SERVICE_FIELDS.filter((field) =>
      isBlankValue(employee[field]),
    );
  }

  async detectMissingDocuments(employeeId: string): Promise<string[]> {
    const docs = await this.employeeDocumentsService.findByEmployee(employeeId);
    const existing = new Set(
      docs.map((doc) => normalizeDocLabel(doc.label)),
    );
    return REQUIRED_DOCUMENT_LABELS.filter(
      (label) => !existing.has(normalizeDocLabel(label)),
    );
  }

  async getGatherSummary(employeeId: string): Promise<{
    blankFields: EmployeeSelfServiceField[];
    missingDocuments: string[];
    missingPhoto: boolean;
    hasWork: boolean;
  }> {
    const employee = await this.employeesService.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');

    const blankFields = this.detectBlankFields(employee);
    const missingDocuments = await this.detectMissingDocuments(employeeId);
    const missingPhoto = !hasEmployeePhoto(employee);

    return {
      blankFields,
      missingDocuments,
      missingPhoto,
      hasWork: blankFields.length > 0 || missingDocuments.length > 0 || missingPhoto,
    };
  }

  async getActiveLinkForEmployee(
    employeeId: string,
  ): Promise<Record<string, unknown> | null> {
    await this.expireStaleLinks();
    const doc = await this.linkModel
      .findOne({ employeeId, status: 'active' })
      .sort({ createdAt: -1 })
      .exec();
    return doc ? this.toPublicLink(doc) : null;
  }

  async createLink(
    employeeId: string,
    requestedBy: string,
    frontendOrigin: string,
  ): Promise<{
    link: Record<string, unknown>;
    otp: string;
    url: string;
  }> {
    await this.expireStaleLinks();

    const employee = await this.employeesService.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');

    const blankFields = this.detectBlankFields(employee);
    const missingDocuments = await this.detectMissingDocuments(employeeId);
    const needsPhoto = !hasEmployeePhoto(employee);

    if (blankFields.length === 0 && missingDocuments.length === 0 && !needsPhoto) {
      throw new BadRequestException(
        'This employee profile has no blank fields, missing documents, or missing ID photo to collect.',
      );
    }

    await this.linkModel.updateMany(
      { employeeId, status: 'active' },
      { $set: { status: 'revoked' } },
    );

    const otp = generateResetCode();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + DATA_GATHER_LINK_TTL_MS);

    const doc = await this.linkModel.create({
      id: randomUUID(),
      employeeId,
      employeeCode: String(employee.employeeCode || employeeId),
      employeeName: employeeDisplayName(employee),
      token,
      otpHash: hashPassword(otp),
      status: 'active',
      requestedBy,
      expiresAt,
      blankFields,
      missingDocuments,
      needsPhoto,
    });

    const url = `${frontendOrigin.replace(/\/$/, '')}/employee/update/${token}`;

    return {
      link: this.toPublicLink(doc),
      otp,
      url,
    };
  }

  async revokeLink(linkId: string): Promise<void> {
    const doc = await this.linkModel.findOne({ id: linkId }).exec();
    if (!doc) throw new NotFoundException('Data collection link not found.');
    if (doc.status !== 'active') {
      throw new BadRequestException(`Link is already ${doc.status}.`);
    }
    doc.status = 'revoked';
    await doc.save();
  }

  async getLinkStatus(token: string): Promise<{
    usable: boolean;
    status: string;
    message: string;
    employeeName?: string;
    expiresAt?: string;
  }> {
    await this.expireStaleLinks();
    const doc = await this.linkModel.findOne({ token: token.trim() }).exec();
    if (!doc) {
      return {
        usable: false,
        status: 'invalid',
        message: 'This link is invalid or no longer exists.',
      };
    }

    if (doc.status === 'submitted') {
      return {
        usable: false,
        status: 'submitted',
        message:
          'This link has already been used and is no longer active. Contact HR if you need to update your details again.',
        employeeName: doc.employeeName,
      };
    }

    if (doc.status === 'revoked') {
      return {
        usable: false,
        status: 'revoked',
        message: 'This link has been revoked by HR and can no longer be used.',
        employeeName: doc.employeeName,
      };
    }

    if (doc.status === 'expired' || doc.expiresAt.getTime() < Date.now()) {
      if (doc.status === 'active') {
        doc.status = 'expired';
        await doc.save();
      }
      return {
        usable: false,
        status: 'expired',
        message:
          'This link has expired because it was not used within 2 days. Ask HR to generate a new link.',
        employeeName: doc.employeeName,
        expiresAt: doc.expiresAt.toISOString(),
      };
    }

    return {
      usable: true,
      status: 'active',
      message: 'Enter the one-time password shared by HR to unlock the form.',
      employeeName: doc.employeeName,
      expiresAt: doc.expiresAt.toISOString(),
    };
  }

  private async findActiveLinkByToken(
    token: string,
  ): Promise<EmployeeDataGatherLinkDocument> {
    const status = await this.getLinkStatus(token);
    if (!status.usable) {
      throw new BadRequestException(status.message);
    }

    const doc = await this.linkModel
      .findOne({ token: token.trim() })
      .select('+otpHash +sessionToken')
      .exec();
    if (!doc) throw new NotFoundException('This data collection link is invalid.');
    return doc;
  }

  async verifyOtp(
    token: string,
    otp: string,
  ): Promise<{ sessionToken: string; sessionExpiresAt: string }> {
    const doc = await this.findActiveLinkByToken(token);
    if (!verifyPassword(otp.trim(), doc.otpHash)) {
      throw new UnauthorizedException('Invalid one-time password.');
    }

    const sessionToken = generateToken();
    doc.sessionToken = sessionToken;
    doc.sessionExpiresAt = new Date(Date.now() + DATA_GATHER_SESSION_TTL_MS);
    await doc.save();

    return {
      sessionToken,
      sessionExpiresAt: doc.sessionExpiresAt.toISOString(),
    };
  }

  private assertSession(
    doc: EmployeeDataGatherLinkDocument,
    sessionToken: string,
  ): void {
    const token = sessionToken.trim();
    if (!token || !doc.sessionToken || token !== doc.sessionToken) {
      throw new UnauthorizedException('Session expired. Enter the one-time password again.');
    }
    if (
      !doc.sessionExpiresAt ||
      doc.sessionExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Session expired. Enter the one-time password again.');
    }
  }

  async getForm(
    token: string,
    sessionToken: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.findActiveLinkByToken(token);
    this.assertSession(doc, sessionToken);

    const employee = await this.employeesService.findById(doc.employeeId);
    const photoExists = employee ? hasEmployeePhoto(employee) : false;

    const fields = doc.blankFields.map((field) => {
      const key = field as EmployeeSelfServiceField;
      return {
        key,
        label: EMPLOYEE_FIELD_LABELS[key] ?? field,
        inputType: this.inferInputType(key),
        options: this.fieldOptions(key),
      };
    });

    return {
      employeeName: doc.employeeName,
      employeeCode: doc.employeeCode,
      expiresAt: doc.expiresAt.toISOString(),
      fields,
      missingDocuments: doc.missingDocuments,
      photo: {
        label: PASSPORT_PHOTO_LABEL,
        hasPhoto: photoExists,
        canUpload: doc.needsPhoto && !photoExists,
      },
      sessionExpiresAt: doc.sessionExpiresAt?.toISOString(),
    };
  }

  async getPhoto(
    token: string,
    sessionToken: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const doc = await this.findActiveLinkByToken(token);
    this.assertSession(doc, sessionToken);

    const employee = await this.employeesService.findById(doc.employeeId);
    if (!employee || !hasEmployeePhoto(employee)) {
      throw new NotFoundException('Employee photo not found.');
    }

    return this.employeesService.getPhotoContent(doc.employeeId);
  }

  async submit(
    token: string,
    sessionToken: string,
    fieldUpdates: Record<string, unknown>,
    documents: SubmitDataGatherDocumentDto[],
    photo?: string,
  ): Promise<{ changeRequestId: string; message: string }> {
    const doc = await this.findActiveLinkByToken(token);
    this.assertSession(doc, sessionToken);

    const employee = await this.employeesService.findById(doc.employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');

    const allowedFieldSet = new Set(doc.blankFields);
    const changes: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fieldUpdates || {})) {
      if (!allowedFieldSet.has(key)) continue;
      if (!EMPLOYEE_SELF_SERVICE_FIELDS.includes(key as EmployeeSelfServiceField)) {
        continue;
      }
      const strValue =
        value === null || value === undefined ? '' : String(value).trim();
      if (!strValue) continue;
      if (!isBlankValue(employee[key])) {
        throw new BadRequestException(
          `Field "${EMPLOYEE_FIELD_LABELS[key as EmployeeSelfServiceField] ?? key}" is no longer blank.`,
        );
      }
      changes[key] = strValue;
    }

    const allowedDocSet = new Set(
      doc.missingDocuments.map((label) => normalizeDocLabel(label)),
    );
    const pendingDocuments: SubmitDataGatherDocumentDto[] = [];

    for (const item of documents || []) {
      const label = String(item.label || '').trim();
      if (!label || !allowedDocSet.has(normalizeDocLabel(label))) {
        throw new BadRequestException(`Document "${label || 'unknown'}" is not required.`);
      }
      pendingDocuments.push(item);
    }

    const photoPayload = String(photo || '').trim();
    let pendingPhoto: string | undefined;
    if (photoPayload) {
      if (!doc.needsPhoto) {
        throw new BadRequestException(
          'A passport photo was not requested for this link.',
        );
      }
      if (hasEmployeePhoto(employee)) {
        throw new BadRequestException(
          'A passport photo is already on file and cannot be changed via this link.',
        );
      }
      pendingPhoto = photoPayload;
    }

    if (Object.keys(changes).length === 0 && pendingDocuments.length === 0 && !pendingPhoto) {
      throw new BadRequestException(
        'Please fill at least one blank field, upload at least one document, or add a passport photo.',
      );
    }

    const changeRequest = await this.changeRequestsService.submitFromSelfService({
      employeeId: doc.employeeId,
      changes,
      pendingDocuments: pendingDocuments.map((item) => ({
        employeeId: doc.employeeId,
        label: item.label.trim(),
        fileBase64: item.fileBase64,
        mimeType: item.mimeType,
        originalSizeBytes: item.originalSizeBytes,
        storedSizeBytes: item.storedSizeBytes,
        quality: item.quality,
      })),
      pendingPhoto: pendingPhoto
        ? { employeeId: doc.employeeId, photoBase64: pendingPhoto }
        : undefined,
      notes: `Employee self-service submission via data collection link for ${doc.employeeName} (${doc.employeeCode}).`,
    });

    doc.status = 'submitted';
    doc.submittedAt = new Date();
    doc.changeRequestId = String(changeRequest.id);
    doc.otpHash = hashPassword(randomUUID());
    doc.sessionToken = '';
    doc.sessionExpiresAt = undefined;
    await doc.save();

    return {
      changeRequestId: String(changeRequest.id),
      message:
        'Your details have been submitted successfully. They will be posted to your profile after administrator approval.',
    };
  }

  private inferInputType(field: EmployeeSelfServiceField): string {
    if (field.includes('Dob') || field === 'dateOfBirth') {
      return 'date';
    }
    if (field === 'gender' || field === 'maritalStatus') return 'select';
    if (field.includes('Address')) return 'textarea';
    return 'text';
  }

  private fieldOptions(field: EmployeeSelfServiceField): string[] | undefined {
    if (field === 'gender') return ['Male', 'Female', 'Other'];
    if (field === 'maritalStatus') {
      return ['Single', 'Married', 'Divorced', 'Widowed'];
    }
    return undefined;
  }

  private toPublicLink(
    doc: EmployeeDataGatherLinkDocument,
  ): Record<string, unknown> {
    const obj = doc.toObject();
    const { _id, __v, otpHash, sessionToken, ...rest } = obj as unknown as Record<
      string,
      unknown
    >;
    return rest;
  }
}
