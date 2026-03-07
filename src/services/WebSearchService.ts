import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  imageUrl?: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  html: string;
  links: string[];
  images: string[];
  cssFiles: string[];
  jsFiles: string[];
  meta: Record<string, string>;
}

export class WebSearchService {
  private static braveApiKey: string | undefined;

  static setBraveApiKey(key: string): void {
    this.braveApiKey = key;
  }

  /**
   * Fetch a URL with redirect following, returning raw response.
   * Handles http/https, follows up to 5 redirects, and supports custom headers.
   */
  static fetchUrl(
    url: string,
    headers: Record<string, string> = {},
    redirectCount = 0,
  ): Promise<{ statusCode: number; data: string; contentType: string; finalUrl: string }> {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch {
        reject(new Error(`Invalid URL: ${url}`));
        return;
      }

      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache',
          ...headers,
        },
        timeout: 20000,
        rejectUnauthorized: false,
      };

      const req = (client.request as Function)(options, (res: http.IncomingMessage) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          resolve(WebSearchService.fetchUrl(redirectUrl, headers, redirectCount + 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          resolve({
            statusCode: res.statusCode || 0,
            data,
            contentType: (res.headers['content-type'] as string) || '',
            finalUrl: url,
          });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Search using Brave Search API (requires API key) or fall back to DuckDuckGo HTML.
   */
  static async search(query: string, count = 8): Promise<WebSearchResult[]> {
    // Try Brave Search API first if key is set
    if (this.braveApiKey) {
      try {
        const results = await this.braveSearch(query, count);
        if (results.length > 0) return results;
      } catch (err) {
        console.debug('[Andor WebSearch] Brave search failed, falling back:', err);
      }
    }

    // Fall back to DuckDuckGo HTML scraping
    return this.duckDuckGoSearch(query, count);
  }

  private static async braveSearch(query: string, count: number): Promise<WebSearchResult[]> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&text_decorations=false`;
    const response = await this.fetchUrl(url, {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'X-Subscription-Token': this.braveApiKey!,
    });

    if (response.statusCode !== 200) {
      throw new Error(`Brave API error: ${response.statusCode}`);
    }

    const data = JSON.parse(response.data);
    const webResults: WebSearchResult[] = (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
      imageUrl: r.thumbnail?.src,
    }));

    return webResults;
  }

  private static async duckDuckGoSearch(query: string, count: number): Promise<WebSearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const response = await this.fetchUrl(url);
      if (response.statusCode < 200 || response.statusCode >= 300) return [];
      return this.parseDDGResults(response.data, count);
    } catch (err) {
      console.debug('[Andor WebSearch] DDG error:', err);
      return [];
    }
  }

  private static parseDDGResults(html: string, count: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];

    // Try to parse result blocks
    const blockRegex = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    while ((match = blockRegex.exec(html)) !== null && results.length < count) {
      const block = match[1];
      const titleMatch = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      const snippetMatch = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);

      if (titleMatch) {
        results.push({
          url: titleMatch[1].replace(/&amp;/g, '&'),
          title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        });
      }
    }

    // Fallback: simple link extraction
    if (results.length === 0) {
      const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = linkRegex.exec(html)) !== null && results.length < count) {
        results.push({
          url: match[1].replace(/&amp;/g, '&'),
          title: match[2].replace(/<[^>]+>/g, '').trim(),
          snippet: '',
        });
      }
    }

    return results;
  }

  /**
   * Format search results for AI context.
   */
  static formatForContext(results: WebSearchResult[]): string {
    if (results.length === 0) return 'No web search results found.';

    const lines = [`## Web Search Results (${results.length} found)\n`];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`**${i + 1}. ${r.title}**`);
      lines.push(`URL: ${r.url}`);
      if (r.snippet) lines.push(`> ${r.snippet}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Deep fetch a URL: returns full structured page data including HTML, text,
   * links, images, CSS files, JS files, and meta tags.
   */
  static async fetchPageFull(url: string, maxTextLength = 8000): Promise<PageContent> {
    const response = await this.fetchUrl(url);
    const html = response.data;
    const finalUrl = response.finalUrl;

    const baseUrl = new URL(finalUrl);

    // Extract title
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : '';

    // Extract meta tags
    const meta: Record<string, string> = {};
    const metaRegex = /<meta[^>]+(?:name|property)="([^"]*)"[^>]+content="([^"]*)"[^>]*>/gi;
    let m;
    while ((m = metaRegex.exec(html)) !== null) {
      meta[m[1]] = this.decodeHtmlEntities(m[2]);
    }

    // Extract all links
    const links: string[] = [];
    const linkRegex = /<a[^>]+href="([^"#][^"]*)"[^>]*>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], finalUrl).toString();
        if (!links.includes(resolved)) links.push(resolved);
      } catch { /* ignore invalid URLs */ }
    }

    // Extract image URLs
    const images: string[] = [];
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    while ((m = imgRegex.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], finalUrl).toString();
        if (!images.includes(resolved)) images.push(resolved);
      } catch { /* ignore */ }
    }
    // Also look for background images in inline styles
    const bgRegex = /url\(['"]?([^'")\s]+)['"]?\)/gi;
    while ((m = bgRegex.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], finalUrl).toString();
        if (!images.includes(resolved) && !resolved.startsWith('data:')) images.push(resolved);
      } catch { /* ignore */ }
    }

    // Extract CSS files
    const cssFiles: string[] = [];
    const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href="([^"]+)"/gi;
    while ((m = cssRegex.exec(html)) !== null) {
      try {
        cssFiles.push(new URL(m[1], finalUrl).toString());
      } catch { /* ignore */ }
    }

    // Extract JS files
    const jsFiles: string[] = [];
    const jsRegex = /<script[^>]+src="([^"]+)"/gi;
    while ((m = jsRegex.exec(html)) !== null) {
      try {
        jsFiles.push(new URL(m[1], finalUrl).toString());
      } catch { /* ignore */ }
    }

    // Extract readable text content
    const text = this.extractText(html, maxTextLength);

    return { url: finalUrl, title, text, html: html.substring(0, 50000), links, images, cssFiles, jsFiles, meta };
  }

  /**
   * Simplified page fetch returning clean text (for backwards compatibility).
   */
  static async fetchPageContent(url: string, maxLength = 8000): Promise<string> {
    try {
      const response = await this.fetchUrl(url);
      if (response.statusCode < 200 || response.statusCode >= 300) return '';
      return this.extractText(response.data, maxLength);
    } catch {
      return '';
    }
  }

  private static extractText(html: string, maxLength: number): string {
    // Remove script, style, nav, header, footer blocks
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '');

    // Replace block elements with newlines for readability
    text = text
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n');

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

    return text.substring(0, maxLength);
  }

  private static decodeHtmlEntities(str: string): string {
    return str
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }
}
