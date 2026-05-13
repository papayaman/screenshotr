// src/app/services/automation.service.ts
import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AutomationService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private zone: NgZone) { }

  // --- EXECUTION METHODS ---
  runSingleTask(task: any, outputDir: string, globalWaitDelay: number) {
    return this.http.post(`${this.apiUrl}/api/run-task`, { task, outputDir, globalWaitDelay });
  }

  cleanFolder(outputDir: string) {
    return this.http.post(`${this.apiUrl}/api/clean-folder`, { outputDir });
  }

  zipFolder(outputDir: string) {
    return this.http.post(`${this.apiUrl}/api/zip-folder`, { outputDir });
  }

  // --- JOURNEY METHODS ---
  previewJourney(task: any) {
    return this.http.post(`${this.apiUrl}/api/preview-journey`, { task });
  }

  streamJourney(task: any): Observable<string> {
    return new Observable(observer => {
      const query = `url=${encodeURIComponent(task.url)}&width=${task.width}&height=${task.height}`;
      const eventSource = new EventSource(`${this.apiUrl}/api/stream-journey?${query}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.zone.run(() => observer.next(data.selector));
      };

      eventSource.addEventListener('done', () => {
        this.zone.run(() => observer.complete());
        eventSource.close();
      });

      eventSource.onerror = () => {
        this.zone.run(() => observer.error('Stream Error'));
        eventSource.close();
      };

      return () => eventSource.close();
    });
  }

  // --- FILE MANAGEMENT METHODS ---
  saveLocalConfig(filename: string, config: any) {
    return this.http.post(`${this.apiUrl}/api/save-config`, { filename, config });
  }

  getRecentFiles(): Observable<{ local: string[] }> {
    return this.http.get<{ local: string[] }>(`${this.apiUrl}/api/recent-files`);
  }

  loadConfigFile(filename: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/api/load-config/${filename}`);
  }

  deleteConfig(filename: string) {
    return this.http.post(`${this.apiUrl}/api/delete-config`, { filename });
  }
}