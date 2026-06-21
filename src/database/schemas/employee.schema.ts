import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ _id: false })
export class LedgerLineItem {
  @Prop({ required: true }) id!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ default: 0 }) amount!: number;
  @Prop({ default: '' }) entryDate!: string;
  @Prop({ default: '' }) note!: string;
}

@Schema({ _id: false })
export class LedgerEntry {
  @Prop({ type: [LedgerLineItem], default: [] }) ledgerItems!: LedgerLineItem[];
  @Prop({ default: 0 }) advance!: number;
  @Prop({ default: 0 }) penalty!: number;
  @Prop({ default: 0 }) uniform!: number;
  @Prop({ default: 0 }) foodPerk!: number;
  @Prop({ default: 0 }) accommodationPerk!: number;
  @Prop({ default: 0 }) conveyancePerk!: number;
  @Prop({ default: '' }) penaltyReason!: string;
  @Prop({ enum: ['Unpaid', 'Paid', 'Hold'], default: 'Unpaid' })
  paymentStatus!: string;
}

@Schema({ _id: false })
export class CustomField {
  @Prop() name!: string;
  @Prop() type!: string;
  @Prop() value!: string;
}

@Schema({ _id: false })
export class SupervisorLogin {
  @Prop({ default: '' }) phone!: string;
  @Prop({ default: '', select: false }) passwordHash!: string;
  @Prop({ default: false }) enabled!: boolean;
}

@Schema({ timestamps: true, collection: 'employees' })
export class Employee {
  @Prop({ required: true, unique: true, index: true })
  employeeCode!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ default: 0, index: true })
  srNo!: number;

  @Prop({ default: '', index: true })
  location!: string;

  @Prop({ default: '' })
  nameAsPerAadhar!: string;

  @Prop({ default: 0 })
  grossSalary!: number;

  @Prop({ default: 0 })
  basicSalary!: number;

  @Prop({ default: '' })
  esic!: string;

  @Prop({ default: '' })
  uan!: string;

  @Prop({ default: '' })
  aadharNo!: string;

  @Prop({ default: '' })
  nameAsPerAadharColumn!: string;

  @Prop({ default: '' })
  panNo!: string;

  @Prop({ default: '' })
  nameAsPerPan!: string;

  @Prop({ default: '' })
  bankAccountNo!: string;

  @Prop({ default: '' })
  ifscCode!: string;

  @Prop({ default: '' })
  nameAsPerBank!: string;

  @Prop({ default: '' })
  fatherName!: string;

  @Prop({ default: '' })
  husbandName!: string;

  @Prop({ default: '' })
  pfJoiningDate!: string;

  @Prop({ default: '' })
  exitDate!: string;

  @Prop({ default: '' })
  exitReason!: string;

  @Prop({ default: false })
  complianceEnabled!: boolean;

  /** Professional Tax deduction enabled for this employee (only applies where the office location levies PT). */
  @Prop({ default: false })
  ptEnabled!: boolean;

  @Prop({ enum: ['gross', 'ceiling_15000'], default: 'gross' })
  pfCalculationMode!: string;

  @Prop({ default: '' })
  dateOfBirth!: string;

  @Prop({ default: '' })
  gender!: string;

  @Prop({ default: '' })
  maritalStatus!: string;

  @Prop({ default: '' })
  aadharLinkMobNo!: string;

  @Prop({ default: '' })
  previousUanNo!: string;

  @Prop({ default: '' })
  previousEsicNo!: string;

  @Prop({ default: '' })
  presentAddress!: string;

  @Prop({ default: '' })
  permanentAddress!: string;

  @Prop({ default: '' })
  nomineeName!: string;

  @Prop({ default: '' })
  nomineeDob!: string;

  @Prop({ default: '' })
  nomineeRelation!: string;

  @Prop({ default: '' })
  familyMember1Name!: string;

  @Prop({ default: '' })
  familyMember1Dob!: string;

  @Prop({ default: '' })
  familyMember1Relation!: string;

  @Prop({ default: '' })
  familyMember2Name!: string;

  @Prop({ default: '' })
  familyMember2Dob!: string;

  @Prop({ default: '' })
  familyMember2Relation!: string;

  @Prop({ default: '' })
  familyMember3Name!: string;

  @Prop({ default: '' })
  familyMember3Dob!: string;

  @Prop({ default: '' })
  familyMember3Relation!: string;

  @Prop({ default: '', index: true })
  skillCategory!: string;

  @Prop({ default: '', index: true })
  role!: string;

  @Prop({ default: 0 })
  dailyWage!: number;

  @Prop({ enum: ['monthly', 'daily'], default: 'monthly' })
  salaryWageMode!: string;

  @Prop({ default: '' })
  employeeMobile!: string;

  @Prop({ default: '' })
  nomineeMobile!: string;

  @Prop({ default: '' })
  familyMember1Mobile!: string;

  @Prop({ default: '' })
  familyMember2Mobile!: string;

  @Prop({ default: '' })
  familyMember3Mobile!: string;

  @Prop({ type: [CustomField], default: [] })
  customFields!: CustomField[];

  @Prop({ default: '' })
  workingDaysType!: string;

  @Prop({ default: 0 })
  advance!: number;

  @Prop({ default: 0 })
  penalty!: number;

  @Prop({ default: 0 })
  uniform!: number;

  @Prop({ default: 0 })
  foodPerk!: number;

  @Prop({ default: 0 })
  accommodationPerk!: number;

  @Prop({ default: 0 })
  conveyancePerk!: number;

  @Prop({ type: Object, default: {} })
  monthlyLedger!: Record<string, LedgerEntry>;

  @Prop({ enum: ['active', 'exited'], default: 'active' })
  status!: string;

  @Prop({ default: '' })
  photo!: string;

  @Prop({ default: '' })
  photoDataBase64!: string;

  @Prop({ default: '' })
  photoUrl!: string;

  @Prop({ default: '' })
  photoFileId!: string;

  @Prop({ default: '' })
  idCard!: string;

  @Prop({ default: '' })
  idCardDataBase64!: string;

  @Prop({ default: '' })
  idCardGeneratedAt!: string;

  /** Secret token required for public ID card verification links. */
  @Prop({ default: '', select: false })
  idCardVerifyToken!: string;

  @Prop({ type: SupervisorLogin, default: {} })
  supervisorLogin!: SupervisorLogin;

  @Prop({ type: [String], default: [] })
  assignedBlocks!: string[];
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

EmployeeSchema.index({ nameAsPerAadhar: 'text', employeeCode: 'text' });
