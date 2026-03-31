const puppeteer = require('puppeteer');
const fs = require('fs');

const wait = ms => new Promise(r => setTimeout(r, ms));

async function getYandexReviews(url) {
    console.log('Запуск браузера...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
    await page.setViewport({ width: 1920, height: 1080 });
    
    const apiReviews = [];
    const orgId = url.match(/oid%3D(\d+)/)?.[1] || url.match(/oid=(\d+)/)?.[1];
    
    page.on('response', async response => {
        const reqUrl = response.url();
        if (reqUrl.includes('reviews') && reqUrl.includes('api')) {
            try {
                const data = await response.json();
                if (data.reviews) {
                    apiReviews.push(...data.reviews);
                    console.log(`API: получено ${apiReviews.length} отзывов`);
                }
            } catch (e) {}
        }
    });
    
    console.log('Загрузка страницы...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    
    await page.waitForSelector('.card-reviews-view', { timeout: 30000 }).catch(() => {});
    
    let reviews = await extractReviews(page);
    console.log(`Со страницы: ${reviews.length} отзывов`);
    
    let prevCount = reviews.length;
    let noChangeCount = 0;
    
    while (noChangeCount < 30) {
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
    
    if (apiReviews.length > reviews.length) {
        console.log(`Используем API данные: ${apiReviews.length} отзывов`);
        reviews = apiReviews.map((r, i) => ({
            author: r.author?.name || r.user?.name || 'Аноним',
            rating: r.rating || r.grade || 0,
            date: r.date || r.created || '',
            text: r.text || r.comment || ''
        }));
    }
    
    console.log(`\nВсего: ${reviews.length} отзывов`);
    
    await browser.close();
    return reviews;
}

async function extractReviews(page) {
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

function formatReviews(reviews) {
    return reviews.map((r, i) => ({
        num: i + 1,
        author: r.author,
        rating: r.rating,
        date: r.date,
        text: r.text
    }));
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Использование:');
        console.log('  node yandex-reviews.js <URL>');
        console.log('');
        console.log('Пример:');
        console.log('  node yandex-reviews.js "https://yandex.ru/maps/..."');
        process.exit(1);
    }
    
    const url = args[0];
    const oidMatch = url.match(/oid%3D(\d+)/) || url.match(/oid=(\d+)/);
    const orgId = oidMatch ? oidMatch[1] : Date.now();
    
    try {
        const reviews = await getYandexReviews(url);
        
        if (reviews.length === 0) {
            console.log('Отзывов не найдено');
            return;
        }
        
        const formatted = formatReviews(reviews);
        
        const filename = `yandex_reviews_${orgId}.json`;
        fs.writeFileSync(filename, JSON.stringify(formatted, null, 2), 'utf8');
        
        console.log(`\nСохранено ${reviews.length} отзывов в ${filename}`);
        
        console.log('\nПоследние 5 отзывов:');
        formatted.slice(-5).reverse().forEach(r => {
            console.log(`\n${r.author} | ${r.rating}⭐ | ${r.date}`);
            console.log(`  ${(r.text || '').substring(0, 100)}...`);
        });
        
    } catch (e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

main();
