import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templateCache = new Map<string, HandlebarsTemplateDelegate>();
  private readonly templatesDir: string;

  constructor() {
    this.templatesDir = path.resolve(__dirname, '..', 'templates');
  }

  async loadTemplate(templateName: string): Promise<string> {
    const filePath = path.join(this.templatesDir, `${templateName}.hbs`);

    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (error) {
      this.logger.error(`Template not found: ${templateName} (${filePath})`);
      throw new NotFoundException(`Email template "${templateName}" not found`);
    }
  }

  async compile(templateName: string, data: Record<string, unknown>): Promise<string> {
    let compiledTemplate = this.templateCache.get(templateName);

    if (!compiledTemplate) {
      const source = await this.loadTemplate(templateName);
      compiledTemplate = Handlebars.compile(source);
      this.templateCache.set(templateName, compiledTemplate);
      this.logger.debug(`Template compiled and cached: ${templateName}`);
    }

    return compiledTemplate(data);
  }
}
