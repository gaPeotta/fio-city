# FIO CITY — protótipo 05

## Jogar

Execute `JOGAR.cmd` nesta pasta, mantenha a janela do servidor aberta e acesse http://127.0.0.1:4173. Se já estiver jogando, atualize a página com **Ctrl+F5**. Requer Node.js 18 ou superior e navegador com WebGL2. Os arquivos do Three.js estão incluídos; não precisa de npm install nem conexão com a internet.

1. Clique em **Entrar na cidade**.
2. Use **WASD** para correr, **Espaço** para saltar e **mouse** para mirar numa fachada.
3. **Segure o botão esquerdo** para prender e balançar. **Solte** para liberar. **E** alterna prender/soltar como alternativa.
4. Mire no próximo prédio e repita. **Não há controle manual de comprimento. No chão, apenas mirar e segurar já aciona a puxada inicial. A ancoragem nunca troca automaticamente; para escolher outra, solte e clique novamente.** Se o cabo encontrar uma quina, ele cria uma dobra temporária e a contorna sem perder velocidade nem substituir a âncora. Com a teia, virar a câmera conduz o arco; WASD acrescenta controle: olhando para a fachada, S afasta, A/D desviam e W aproxima.
5. **Esc** pausa e libera o cursor; **H** abre a ajuda; **P** abre ajustes. **0** reinicia; **1–4** escolhem os cenários.

**Shift:** correr/mergulhar. **F:** zip até superfície a 35 m, uma carga por período no ar e recarga de 2 s após pousar. **C + W/S:** escalada próxima à parede; **C + A/D:** deslocamento lateral, com 1,5 s de apoio. **X:** mortal visual, quando houver espaço. Mortais também acontecem automaticamente em solturas rápidas com altura suficiente.

## Alterações desta versão

- No chão, uma puxada automática de até 1,1 s recolhe o cabo gradualmente (máximo 18 m/s) para tirar o personagem do solo. A recolha termina ao ganhar 8 m de altura; comandar para longe após ganhar 3 m também a interrompe. No ar, o comprimento é fixo. A assistência tenta escolher um ponto mais alto na mesma fachada, dentro do cone de mira e do alcance. A teia continua dependendo de geometria real.
- Direção tangencial de até 24 m/s² com WASD durante o balanço e 16 m/s² ao virar a câmera. O comando tem prioridade: a ajuda automática não disputa a direção. Sem comando, a ajuda tangencial de 2,5 m/s² acompanha a velocidade existente, sem puxar para a âncora quando parado, e é desligada acima de 32 m/s. Ajustável em **P**. A gravidade pode gerar velocidades maiores; o limite é da assistência. Soltar preserva exatamente a velocidade instantânea.
- Personagem original com capacete, visor, mochila, bobina, luvas, joelhos e cotovelos articulados. O braço aponta para a ancoragem e a teia sai da mão. Poses de corrida, queda, mergulho, balanço, pouso e mortais contextuais. Animações não alteram a física.
- Céu em gradiente, sol visível, nuvens, água animada, cais com árvores e prédios distantes nas bordas. O distrito jogável continua sendo os mesmos nove quarteirões. A ambientação além do limite é decorativa.

## Arquivos e arquitetura

`src/main.js`: controles, câmera, HUD e integração. `src/physics.js`: passo fixo 120 Hz, cabo unilateral, gravidade, arrasto, raycasts, colisão contínua e ajuda opcional. `src/rope-route.js`: dobras do cabo ao redor de quinas, preservando a âncora. `src/extras.js`: zip e paredes com orçamento limitado. `src/city.js`: geometria procedural dos 36 prédios. `src/visuals.js`: personagem, animações e ambientação. `index.html`/`style.css`: interface. `server.mjs`: servidor local sem dependências. `vendor/`: Three.js 0.180.0 e licença MIT.

## Verificar

Nesta pasta, execute `node --test`. Os testes cobrem âncoras reais, oclusão, cabo frouxo, conservação de energia no modo ideal, soltura, colisões em alta velocidade, comprimento constante sem recolha, limite da ajuda, animação sem alteração física, mergulho, zip, paredes e correspondência entre prédios visíveis e colisores.

O teste de travessia usa um estado inicial aéreo explícito e controles reproduzíveis para atravessar mais de 176 m com quatro ancoragens; não automatiza o tutorial desde o telhado. Para comparar sem assistência, use **P → Física sem assistência**. **Restaurar padrão** volta ao modo simples.

Limitações do protótipo: personagem usa caixa de colisão; o cabo contorna uma quina por vez e não simula enrolamento completo em prédios complexos. Choques frontais ainda podem reduzir a velocidade; câmera e WASD permitem dirigir para fora do contato; a borda do distrito retorna ao ponto de teste. Diversão e conforto precisam de avaliação jogando. Os modelos e sons são procedurais e provisórios; não há assets Marvel/Sony.
