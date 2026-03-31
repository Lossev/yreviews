const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const wait = ms => new Promise(r => setTimeout(r, ms));

async function getYandexReviews(url) {
    console.log('Запуск браузера...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Загрузка страницы...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    
    await page.waitForSelector('.card-reviews-view', { timeout: 30000 }).catch(() => {});
    
    let reviews = await extractReviews(page);
    console.log(`Со страницы: ${reviews.length} отзывов`);
    
    let prevCount = reviews.length;
    let noChangeCount = 0;
    
    while (noChangeCount < 25) {
        await page.evaluate(() => {
            const reviewsContainer = document.querySelector('.card-reviews-view');
            if (reviewsContainer) {
                reviewsContainer.scrollTop = reviewsContainer.scrollHeight;
            }
            document.querySelectorAll('.card-reviews-view, [class*="scroll"]').forEach(el => {
                el.scrollTop = el.scrollHeight;
            });
            window.scrollBy(0, 800);
        });
        
        await wait(2000);
        
        reviews = await extractReviews(page);
        
        if (reviews.length > prevCount) {
            console.log(`Получено: ${reviews.length} отзывов`);
            prevCount = reviews.length;
            noChangeCount = 0;
        } else {
            noChangeCount++;
        }
    }
    
    console.log(`Всего: ${reviews.length} отзывов`);
    
    await browser.close();
    return reviews;
}

async function extractReviews(page) {
    const html = await page.content();
    console.log(`HTML длина: ${html.length}`);
    
    const allElements = await page.evaluate(() => {
        return {
            businessReview: document.querySelectorAll('.business-review-view').length,
            reviewWrapper: document.querySelectorAll('[class*="review"]').length,
            cardReviews: document.querySelectorAll('.card-reviews-view').length,
            bodyText: document.body.innerText.substring(0, 500)
        };
    });
    console.log('Элементы на странице:', JSON.stringify(allElements));
    
    return await page.evaluate(() => {
        const reviewElements = document.querySelectorAll('.business-review-view');
        const reviews = [];
        
        reviewElements.forEach(el => {
            const authorEl = el.querySelector('[itemprop="author"] [itemprop="name"]');
            const author = authorEl ? authorEl.textContent.trim() : 
                           el.querySelector('.business-review-view__author')?.textContent.trim() || 'Аноним';
            
            let rating = 0;
            const ratingEl = el.querySelector('[itemprop="reviewRating"] [itemprop="ratingValue"]');
            if (ratingEl) {
                rating = parseInt(ratingEl.textContent) || 0;
            } else {
                const stars = el.querySelectorAll('.business-rating-icon-view__star._full, .business-rating-badge-view__star._full');
                rating = stars ? stars.length : 0;
            }
            
            if (rating === 0) {
                const ariaLabel = el.querySelector('[aria-label*="звезд"]')?.getAttribute('aria-label');
                if (ariaLabel) {
                    const match = ariaLabel.match(/(\d)/);
                    if (match) rating = parseInt(match[1]);
                }
            }
            
            if (rating === 0) {
                const ratingMeta = el.querySelector('meta[itemprop="ratingValue"]');
                if (ratingMeta) {
                    rating = parseInt(ratingMeta.getAttribute('content')) || 0;
                }
            }
            
            const dateEl = el.querySelector('[itemprop="datePublished"]');
            const date = dateEl ? dateEl.getAttribute('content') || dateEl.textContent.trim() : 
                         el.querySelector('.business-review-view__date')?.textContent.trim() || '';
            
            const textEl = el.querySelector('[itemprop="reviewBody"]');
            const text = textEl ? textEl.textContent.trim() : 
                         el.querySelector('.business-review-view__body-text')?.textContent.trim() || '';
            
            reviews.push({ author, rating, date, text });
        });
        
        return reviews;
    });
}

async function main() {
    const orgId = process.argv[2] || '237134553662';
    const url = `https://yandex.ru/maps/org/${orgId}/?mode=reviews`;
    
    console.log(`ORG_ID: ${orgId}`);
    console.log(`URL: ${url}\n`);
    
    try {
        const reviews = await getYandexReviews(url);
        
        console.log(`Найдено отзывов: ${reviews.length}`);
        
        const formatted = reviews.map((r, i) => ({
            num: i + 1,
            author: r.author,
            rating: r.rating,
            date: r.date,
            text: r.text
        }));
        
        const data = {
            lastUpdated: new Date().toISOString(),
            orgId: orgId,
            totalReviews: formatted.length,
            reviews: formatted
        };
        
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('Создана папка data/');
        }
        
        const filename = path.join(dataDir, 'reviews.json');
        fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
        
        console.log(`\nСохранено ${reviews.length} отзывов в data/reviews.json`);
        
        console.log('\nПоследние 5 отзывов:');
        formatted.slice(-5).reverse().forEach(r => {
            console.log(`${r.author} | ${r.rating}⭐ | ${r.date}`);
        });
        
    } catch (e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

main();
