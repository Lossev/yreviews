# YReviews

Автоматический сбор отзывов с Яндекс Карт через GitHub Actions.

## Настройка

1. **Создай репозиторий на GitHub**
   - Зайди на https://github.com/new
   - Имя: `yreviews`
   - Публичный
   - НЕ ставь галочки на README/gitignore/license
   - Create repository

2. **Загрузи файлы**
   ```bash
   git init
   git add .github .gitignore README.md yreviews-gh.js package.json
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/Lossev/yreviews.git
   git push -u origin main
   ```

3. **Включи GitHub Actions**
   - Settings → Actions → General
   - "Allow all actions and reusable workflows"
   - Save

## Расписание

- 00:00 - 07:00: каждый час (8 запросов)
- 08:00 - 23:59: каждые 36 минут (32 запроса)
- Итого: ~40 запросов/день

## Результат

`data/reviews.json`

```json
{
  "lastUpdated": "2026-03-31T12:00:00.000Z",
  "orgId": "237134553662",
  "totalReviews": 600,
  "reviews": [...]
}
```

## URL для сайта

```
https://raw.githubusercontent.com/Lossev/yreviews/main/data/reviews.json
```

## Изменить ORG_ID

В `.github/workflows/fetch-reviews.yml` строка:
```yaml
default: '237134553662'
```
