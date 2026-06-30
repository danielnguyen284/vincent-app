import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum UserRole {
  ADMIN = "ADMIN",
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  TECHNICIAN = "TECHNICIAN",
  TENANT = "TENANT",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: UserRole })
  role!: UserRole;

  @Column({ type: "enum", enum: UserRole, array: true, nullable: true })
  roles!: UserRole[] | null;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true })
  phone!: string;

  @Column({ type: "varchar", nullable: true })
  email!: string;

  @Column({ type: "varchar", nullable: true })
  payment_qr_code!: string;

  @Column({ type: "varchar" })
  password_hash!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_vincent_mode!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
