import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;
  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: true, // true for 465, false for other ports
      auth: {
        user: this.configService.get('MAIL_USER'), // generated ethereal user
        pass: this.configService.get('MAIL_PASS'), // generated ethereal password
      },
    });
  }

  async sendMail(to: string, subject: string, text: string) {
    const info = await this.transporter.sendMail({
      from: `"${this.configService.get('MAIL_FROM')}" <${this.configService.get('MAIL_FROM')}>`,
      to,
      subject,
      text,
    });

    console.log('Message sent: %s', info.messageId);
  }
}
