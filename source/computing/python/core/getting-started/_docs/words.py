def fetch_words():
    from urllib.request import urlopen

    story = urlopen('http://sixty-north.com/c/t.txt')
    story_words = []
    for line in story:
        line_words = line.decode('utf-8').split()
        for word in line_words:
            story_words.append(word)
    story.close()

if __name__ == '__main__':
    fetch_words()
