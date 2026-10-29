# Riscos de dependências

## Avaliação e decisão

Auditoria local em 28/10/2026, com `CI=true corepack pnpm audit --prod`: 1 crítico, 26 altos, 9 moderados e 1 baixo. O comando retorna falha enquanto há avisos; isso não significa falha dos testes. A classificação e a contagem podem mudar com a base de advisories.

Os críticos/altos de `tar`, `@xmldom/xmldom`, `postcss` e `image-size` aparecem exclusivamente na cadeia de ferramentas de build/exportação do Expo (CLI, configuração e Metro). Não têm alcance no bot em execução. O Expo está em dependencies do Controller, por isso `--prod` também inclui ferramentas de build. O Vitest e seu pool `tinypool` pertencem à cadeia de testes: não são carregados pelo bot e tinypool não apareceu nesta execução de `--prod`. Não interpretar este recorte como ausência de risco no ambiente de desenvolvimento: arquivos de entrada do build devem ser confiáveis.

Há uma exceção à afirmação de que todos os altos são de build: o aviso alto do `zod@3.25.76` também aparece nos pacotes de runtime. A falha ocorre ao **DEFINIR schemas com limites enormes**, não ao validar mensagens contra nossos schemas estáticos. Os limites não são definidos por dados recebidos. **Risco aceito** para os usos atuais; reavaliar se forem introduzidos schemas dinâmicos ou limites fornecidos externamente.

A correção indicada pelo audit é `zod >=4.6.6`, na linha 4. Não há correção indicada na linha 3. Migração para zod 4: **Proposta / Pendente**, com revisão dos contratos e testes antes da atualização. Não aplicar overrides de versões incompatíveis apenas para zerar o relatório.

Referências retornadas pelo audit: [zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [tar crítico](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [xmldom](https://github.com/advisories/GHSA-965w-775f-mr7g), [postcss](https://github.com/advisories/GHSA-r28c-9q8g-f849), [image-size](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).

## Acompanhamento

Reexecutar o audit nas atualizações do lockfile. Atualizar Expo e ferramentas de teste em uma tarefa própria, verificando compatibilidade do SDK, export web e suíte completa. A aceitação cobre os caminhos descritos e deve ser revista se mudar o alcance em runtime.
