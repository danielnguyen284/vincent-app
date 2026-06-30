import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("uploaded_files")
export class UploadedFile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  url!: string;

  @Column({ type: "varchar", nullable: true })
  delete_url!: string;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
