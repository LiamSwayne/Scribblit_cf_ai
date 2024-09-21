def generate_image_urls():
    urls = []

    # Define the parameters for each ERwIn set
    erwin_sets = [
        {"folder": "20", "range1": 900, "range2": 756},
        {"folder": "19", "range1": 446, "range2": 378},
        {"folder": "18", "range1": 223, "range2": 187},
        {"folder": "17", "range1": 110, "range2": 92},
    ]

    # Add sets 1-16 with the same range
    for i in range(1, 17):
        erwin_sets.append({"folder": str(i), "range1": 56, "range2": 45})

    # Generate URLs for all ERwIn sets
    for erwin_set in erwin_sets:
        base_url = f"https://rijks-micrio.azureedge.net/ERwIn/{erwin_set['folder']}/{{number_1}}_{{number_2}}.jpeg"
        for number_1 in range(erwin_set['range1']):
            for number_2 in range(erwin_set['range2']):
                url = base_url.format(number_1=number_1, number_2=number_2)
                urls.append(url)

    return urls

def write_urls_to_file(urls, filename="image_urls.txt"):
    with open(filename, "w") as file:
        for url in urls:
            file.write(url + "\n")

# Generate URLs and write to file
urls = generate_image_urls()
write_urls_to_file(urls)

print(f"URLs have been written to image_urls.txt")
print(f"Total number of URLs: {len(urls)}")