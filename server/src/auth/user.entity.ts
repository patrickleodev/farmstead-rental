import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'app_users' })
export class AppUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'google_id', unique: true, length: 255 })
  googleId: string;

  @Column({ unique: true, length: 320 })
  email: string;

  @Column({ length: 160 })
  name: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
